import type { JsonObject } from "./raw-store.js";
import type { SqliteContextStateStore } from "./state-store.js";
import type { ContextItem, StateDelta, StateRelation } from "./state-types.js";

export interface ReducerResult {
  created: ContextItem[];
  updated: ContextItem[];
  relations: StateRelation[];
  log: string[];
  revision: number;
}

export class StateReducer {
  constructor(private readonly store: SqliteContextStateStore) {}

  apply(sessionId: string, delta: StateDelta): ReducerResult {
    const transaction = this.store.transaction(sessionId, () => {
      const result: ReducerResult = {
        created: [],
        updated: [],
        relations: [],
        log: [],
        revision: this.store.getRevision(sessionId),
      };

      // This order is part of the WO-CC-02 deterministic transition contract.
      for (const goal of delta.new_goals) {
        this.create(
          sessionId,
          { type: "GOAL", content: goal.content, status: "ACTIVE", source_refs: goal.source_refs },
          "CREATE GOAL",
          result
        );
      }
      for (const constraint of delta.new_constraints) {
        this.create(
          sessionId,
          {
            type: "CONSTRAINT",
            content: constraint.content,
            status: "ACTIVE",
            source_refs: constraint.source_refs,
          },
          "CREATE CONSTRAINT",
          result
        );
      }
      for (const decision of delta.new_decisions) {
        const metadata: JsonObject = {};
        if (decision.reason !== undefined) metadata.reason = decision.reason;
        if (decision.reopen_if !== undefined) metadata.reopen_if = decision.reopen_if;
        const item = this.create(
          sessionId,
          {
            type: "DECISION",
            content: decision.content,
            status: "ACTIVE",
            source_refs: decision.source_refs,
            metadata,
          },
          "CREATE DECISION",
          result
        );
        for (const supersededId of decision.supersedes ?? []) {
          this.supersede(sessionId, supersededId, item.id, result);
        }
      }
      for (const question of delta.new_open_questions) {
        this.create(
          sessionId,
          {
            type: "OPEN_QUESTION",
            content: question.content,
            status: "OPEN",
            source_refs: question.source_refs,
          },
          "CREATE OPEN_QUESTION",
          result
        );
      }
      for (const alternative of delta.rejected_alternatives) {
        const metadata: JsonObject = {};
        if (alternative.reason !== undefined) metadata.reason = alternative.reason;
        if (alternative.reopen_if !== undefined) metadata.reopen_if = alternative.reopen_if;
        const item = this.create(
          sessionId,
          {
            type: "REJECTED_ALTERNATIVE",
            content: alternative.content,
            status: "REJECTED",
            source_refs: alternative.source_refs,
            metadata,
          },
          "REJECT ALTERNATIVE",
          result
        );
        for (const rejectedId of alternative.rejects ?? []) {
          result.relations.push(
            this.store.addRelation(sessionId, item.id, "REJECTS", rejectedId)
          );
        }
      }

      for (const goal of delta.updated_goals) {
        const existing = this.store.requireItem(sessionId, goal.id, "GOAL");
        if (existing.status !== "ACTIVE") {
          throw new Error(`Goal ${goal.id} must be ACTIVE before update`);
        }
        if (goal.status !== undefined && goal.status !== "COMPLETED") {
          throw new Error("Goal update status must be COMPLETED");
        }
        const updated = this.store.updateItem(
          sessionId,
          goal.id,
          { content: goal.content, status: goal.status },
          "GOAL"
        );
        result.updated.push(updated);
        result.log.push(`UPDATE GOAL ${goal.id} -> ${updated.status}`);
      }
      for (const constraint of delta.updated_constraints) {
        const existing = this.store.requireItem(sessionId, constraint.id, "CONSTRAINT");
        if (existing.status !== "ACTIVE") {
          throw new Error(`Constraint ${constraint.id} must be ACTIVE before update`);
        }
        if (constraint.status !== undefined && constraint.status !== "SUPERSEDED") {
          throw new Error("Constraint update status must be SUPERSEDED");
        }
        const updated = this.store.updateItem(
          sessionId,
          constraint.id,
          { content: constraint.content, status: constraint.status },
          "CONSTRAINT"
        );
        result.updated.push(updated);
        result.log.push(`UPDATE CONSTRAINT ${constraint.id} -> ${updated.status}`);
      }
      for (const question of delta.resolved_questions) {
        const existing = this.store.requireItem(sessionId, question.id, "OPEN_QUESTION");
        if (existing.status !== "OPEN") {
          throw new Error(`OpenQuestion ${question.id} must be OPEN before resolution`);
        }
        if (question.resolved_by !== undefined) {
          this.store.requireItem(sessionId, question.resolved_by, "DECISION");
        }
        const updated = this.store.updateItem(
          sessionId,
          question.id,
          { status: "RESOLVED" },
          "OPEN_QUESTION"
        );
        result.updated.push(updated);
        result.log.push(`RESOLVE OPEN_QUESTION ${question.id}`);
        if (question.resolved_by !== undefined) {
          result.relations.push(
            this.store.addRelation(sessionId, question.id, "RESOLVED_BY", question.resolved_by)
          );
        }
      }
      for (const supersession of delta.supersessions) {
        this.supersede(
          sessionId,
          supersession.superseded_id,
          supersession.superseding_id,
          result
        );
      }
      for (const relation of delta.new_relations) {
        if (
          relation.relation_type !== "DEPENDS_ON" &&
          relation.relation_type !== "REJECTS" &&
          relation.relation_type !== "DERIVED_FROM"
        ) {
          throw new Error(
            "Explicit relations may only be DEPENDS_ON, REJECTS, or DERIVED_FROM"
          );
        }
        result.relations.push(
          this.store.addRelation(
            sessionId,
            relation.source_id,
            relation.relation_type,
            relation.target_id
          )
        );
        result.log.push(
          `RELATE ${relation.source_id} ${relation.relation_type} ${relation.target_id}`
        );
      }

      return result;
    });
    transaction.value.revision = transaction.revision;
    return transaction.value;
  }

  private create(
    sessionId: string,
    input: Omit<Parameters<SqliteContextStateStore["createItem"]>[0], "session_id">,
    operation: string,
    result: ReducerResult
  ): ContextItem {
    const item = this.store.createItem({ session_id: sessionId, ...input });
    result.created.push(item);
    result.relations.push(
      ...this.store
        .getRelations(sessionId, item.id)
        .filter((relation) => relation.relation_type === "DERIVED_FROM")
    );
    result.log.push(`${operation} ${item.id}`);
    return item;
  }

  private supersede(
    sessionId: string,
    supersededId: string,
    supersedingId: string,
    result: ReducerResult
  ): void {
    if (supersededId === supersedingId) throw new Error("A Decision cannot supersede itself");
    const oldDecision = this.store.requireItem(sessionId, supersededId, "DECISION");
    const newDecision = this.store.requireItem(sessionId, supersedingId, "DECISION");
    if (oldDecision.status !== "ACTIVE") {
      throw new Error(`Decision ${supersededId} must be ACTIVE before supersession`);
    }
    if (newDecision.status !== "ACTIVE") {
      throw new Error(`Decision ${supersedingId} must be ACTIVE to supersede another Decision`);
    }
    const updated = this.store.updateItem(
      sessionId,
      supersededId,
      { status: "SUPERSEDED" },
      "DECISION"
    );
    result.updated.push(updated);
    result.relations.push(
      this.store.addRelation(sessionId, supersedingId, "SUPERSEDES", supersededId)
    );
    result.log.push(`SUPERSEDE ${supersededId} <- ${supersedingId}`);
  }
}

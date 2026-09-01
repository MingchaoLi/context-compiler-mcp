import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ContextCompilerCore,
  SESSION_SCOPE_CONTRACT_VERSION,
  SqliteHistoryRecallStore,
} from "../dist/index.js";

const root = mkdtempSync(join(tmpdir(), "rc-scoped-recall-benchmark-"));
const database = join(root, "context.db");
const sessions = 4;
const headlinesPerSession = 3_000;
const limit = 50;

try {
  const core = new ContextCompilerCore(database);
  core.close();
  const recallBootstrap = new SqliteHistoryRecallStore(database);
  recallBootstrap.close();

  const direct = new DatabaseSync(database);
  const insertSession = direct.prepare("INSERT INTO sessions (id, created_at) VALUES (?, ?)");
  const insertRaw = direct.prepare(
    `INSERT INTO raw_events (
       id, session_id, seq, source_event_id, role, content, event_type,
       created_at, token_count, metadata_json, dense_embedding_json
     ) VALUES (?, ?, ?, ?, 'user', ?, 'message', ?, 1, '{}', NULL)`,
  );
  const insertHeadline = direct.prepare(
    `INSERT INTO history_headlines (
       id, session_id, event_start_seq, event_end_seq, headline, keywords_json, created_at
     ) VALUES (?, ?, ?, ?, 'shared common headline', '["common"]', ?)`,
  );
  const insertFts = direct.prepare(
    `INSERT INTO history_headlines_fts (headline_id, session_id, headline, keywords)
     VALUES (?, ?, 'shared common headline', 'common')`,
  );
  const timestamp = "2026-09-01T00:00:00.000Z";
  direct.exec("BEGIN IMMEDIATE;");
  for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex += 1) {
    const sessionId = `broad-${sessionIndex}`;
    insertSession.run(sessionId, timestamp);
    for (let sequence = 1; sequence <= headlinesPerSession; sequence += 1) {
      const padded = String(sequence).padStart(4, "0");
      const rawId = `raw-${sessionIndex}-${padded}`;
      const headlineId = `headline-${sessionIndex}-${padded}`;
      insertRaw.run(
        rawId,
        sessionId,
        sequence,
        `source-${sessionIndex}-${padded}`,
        `common evidence ${sessionIndex}/${sequence}`,
        timestamp,
      );
      insertHeadline.run(headlineId, sessionId, sequence, sequence, timestamp);
      insertFts.run(headlineId, sessionId);
    }
  }
  direct.exec("COMMIT;");
  const explainValues = Array.from({ length: sessions }, (_, index) => [
    `broad-${index}`,
    index === sessions - 1 ? Number.MAX_SAFE_INTEGER : 2_500 + (index * 100),
    index,
  ]).flat();
  const plan = direct.prepare(
    `EXPLAIN QUERY PLAN
     WITH requested(session_id, max_seq, precedence) AS MATERIALIZED (VALUES ${
       Array.from({ length: sessions }, () => "(?, ?, ?)").join(", ")
     }),
          matched(headline_id, rank) AS MATERIALIZED (
            SELECT headline_id, bm25(history_headlines_fts)
            FROM history_headlines_fts
            WHERE history_headlines_fts MATCH ?
          )
     SELECT h.*, matched.rank
     FROM matched
     JOIN history_headlines AS h ON h.id = matched.headline_id
     JOIN requested AS r ON r.session_id = h.session_id
     WHERE h.event_end_seq <= r.max_seq
     ORDER BY matched.rank ASC, r.precedence DESC, h.id ASC
     LIMIT ?`,
  ).all(...explainValues, '"common"', limit);
  direct.close();
  const ftsMatchScans = plan.filter(row =>
    typeof row.detail === "string" &&
    row.detail.includes("history_headlines_fts") &&
    row.detail.includes("VIRTUAL TABLE INDEX")
  ).length;
  if (ftsMatchScans !== 1 || !plan.some(row => row.detail === "MATERIALIZE matched")) {
    throw new Error(`broad keyword query plan lost single materialized FTS scan: ${JSON.stringify(plan)}`);
  }

  const scope = {
    contract_version: SESSION_SCOPE_CONTRACT_VERSION,
    write_session: { namespace: "authority", session_id: "broad-3" },
    read_scope: [
      { session: { namespace: "authority", session_id: "broad-0" }, frontier: { kind: "FROZEN", raw_sequence: 2_500, state_revision: 0 }, precedence: 0 },
      { session: { namespace: "authority", session_id: "broad-1" }, frontier: { kind: "FROZEN", raw_sequence: 2_600, state_revision: 0 }, precedence: 1 },
      { session: { namespace: "authority", session_id: "broad-2" }, frontier: { kind: "FROZEN", raw_sequence: 2_700, state_revision: 0 }, precedence: 2 },
      { session: { namespace: "authority", session_id: "broad-3" }, frontier: { kind: "CURRENT" }, precedence: 3 },
    ],
  };
  const recall = new SqliteHistoryRecallStore(database);
  const started = performance.now();
  const hits = recall.recallKeywordInScope({ session_scope: scope, query: "common", limit });
  const elapsedMs = performance.now() - started;
  recall.close();
  if (hits.length !== limit || hits.some(({ headline, events }) =>
    headline.session_id !== "broad-3" || events.length !== 1 ||
    events[0]?.session_id !== headline.session_id || events[0]?.seq !== headline.event_end_seq
  )) throw new Error("broad keyword benchmark correctness check failed");
  if (elapsedMs >= 5_000) throw new Error(`broad keyword benchmark exceeded 5000ms: ${elapsedMs}`);
  process.stdout.write(`${JSON.stringify({
    contract: "ripplecontext-session-scope-broad-keyword-benchmark/v1",
    sessions,
    headlines_per_session: headlinesPerSession,
    total_matches: sessions * headlinesPerSession,
    top_k: limit,
    fts_match_scans: ftsMatchScans,
    elapsed_ms: Number(elapsedMs.toFixed(3)),
    result_session: "broad-3",
  })}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}

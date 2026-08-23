import { closeSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "empty";
const auditPath = process.argv[3];

if (mode === "stdin-failure") {
  closeSync(0);
  setInterval(() => {}, 1_000);
} else {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  process.stdin.on("end", () => {
    const source = Buffer.concat(chunks).toString("utf8");
    let request;
    try {
      request = JSON.parse(source);
    } catch {
      process.exitCode = 40;
      return;
    }
    if (auditPath !== undefined) writeFileSync(auditPath, JSON.stringify(request), "utf8");
    respond(request);
  });
}

function emptyDelta() {
  return {
    new_goals: [],
    updated_goals: [],
    new_constraints: [],
    updated_constraints: [],
    new_decisions: [],
    resolved_questions: [],
    new_open_questions: [],
    rejected_alternatives: [],
    supersessions: [],
    new_relations: [],
  };
}

function envelope(delta = emptyDelta()) {
  return JSON.stringify({ version: 1, delta });
}

function currentEventSource(request) {
  if (typeof request?.prompt !== "string") return {};
  const finalLine = request.prompt.split("\n").at(-1);
  try {
    const parsed = JSON.parse(finalLine);
    const id = parsed?.input?.newest_events?.at(-1)?.id;
    return typeof id === "string" && id.length > 0 ? { source_refs: [id] } : {};
  } catch {
    return {};
  }
}

function respond(request) {
  switch (mode) {
    case "empty":
    case "audit":
      process.stdout.write(envelope());
      return;
    case "goal":
      process.stdout.write(envelope({
        ...emptyDelta(),
        new_goals: [{ content: "Runtime-created goal", ...currentEventSource(request) }],
      }));
      return;
    case "delayed-goal":
      setTimeout(() => process.stdout.write(envelope({
        ...emptyDelta(),
        new_goals: [{ content: "Runtime-created goal", ...currentEventSource(request) }],
      })), 150);
      return;
    case "stderr":
      process.stderr.write("PRIVATE-WORKER-DIAGNOSTIC\n");
      process.stdout.write(envelope());
      return;
    case "invalid-delta":
      process.stdout.write(envelope({ ...emptyDelta(), unknown: [] }));
      return;
    case "malformed":
      process.stdout.write("{not-json");
      return;
    case "extra-envelope":
      process.stdout.write(JSON.stringify({ version: 1, delta: emptyDelta(), extra: true }));
      return;
    case "wrong-version":
      process.stdout.write(JSON.stringify({ version: 2, delta: emptyDelta() }));
      return;
    case "wrong-shape":
      process.stdout.write(JSON.stringify({ version: 1, delta: [] }));
      return;
    case "double-json":
      process.stdout.write(`${envelope()}${envelope()}`);
      return;
    case "nonzero":
      process.stderr.write("PRIVATE-WORKER-FAILURE\n");
      process.exitCode = 23;
      return;
    case "signal":
      process.kill(process.pid, "SIGTERM");
      return;
    case "timeout":
      setInterval(() => {}, 1_000);
      return;
    case "overflow":
      process.stdout.write("x".repeat(100_000));
      return;
    case "environment":
      process.stdout.write(envelope({
        ...emptyDelta(),
        new_goals: [{ content: process.env.CONTEXT_COMPILER_TEST_SENTINEL ?? "missing" }],
      }));
      return;
    default:
      process.stderr.write(`unknown worker mode ${mode}\n`);
      process.exitCode = 41;
  }
}

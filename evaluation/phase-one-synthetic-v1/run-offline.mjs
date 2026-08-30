#!/usr/bin/env node

import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_BASELINE = "8cf8ca7c24d34fe3c6b591dc721937992ea67c76";
const FAIRNESS_BLOB = "243636ae70d5e4f0b90c9f77eeea0b48def2eb25";
const CORPUS_ID = "rc-phase-one-synthetic-v1";
const ORACLE_ID = "rc-phase-one-synthetic-oracle-v1";
const RENDERER_ID = "RC_PHASE1_FACT_LINES_V1";
const TOKENIZER_ID = "CC_ESTIMATE_TOKENS_JS_UTF16_CODE_UNITS_DIV4_V1";
const CANONICALIZATION_ID = "RFC8785_JCS_VALUE_UTF8_NO_TERMINATOR_JSON_FILE_LF_V1";
const NORMALIZATION_ID = "RC_PHASE1_EXACT_UTF8_LF_NO_NORMALIZATION_V1";
const BUNDLE_PREIMAGE_ID = "ASCII_PATH_SORTED_PATH_FILE_SHA256_JCS_V1";
const CLAIM_CEILING = "PUBLIC_SYNTHETIC_FIXTURE_PACKET_INCLUSION";
const FIXTURE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(FIXTURE_DIRECTORY, "../..");

const CASES = [
  ["PH1-C01-RELEVANT-DISTRACTOR", "RELEVANT_DISTRACTOR", 2],
  ["PH1-C02-STALE-SUPERSEDED", "STALE_SUPERSEDED", 3],
  ["PH1-C03-CONFLICT-PROVENANCE", "CONFLICT_PROVENANCE", 2],
  ["PH1-C04-MISSING-UNCERTAIN", "MISSING_UNCERTAIN", 1],
  ["PH1-C05-LONG-CONTEXT", "LONG_CONTEXT", 2],
  ["PH1-C06-SAFE-FALLBACK", "SAFE_FALLBACK", 1],
];
const CASE_IDS = CASES.map(([caseId]) => caseId);
const CATEGORY_BY_CASE = new Map(CASES.map(([caseId, category]) => [caseId, category]));
const CUTOFF_SEQ_BY_CASE = new Map(CASES.map(([caseId, , cutoff]) => [caseId, cutoff]));
const ARMS = [
  "D0_FULL_AUTHORIZED_FIXTURE",
  "D1_HOST_NATIVE_BOUNDED",
  "D2_RIPPLECONTEXT_COMPILED",
];
const INVALID_CODES = [
  "INVALID_MANIFEST_CHANGED",
  "INVALID_FIXTURE_DIGEST",
  "INVALID_ORACLE_DIGEST",
  "INVALID_RENDERER_DIGEST",
  "INVALID_CASE_SET",
  "INVALID_CUTOFF_OR_ORDER",
  "INVALID_CROSS_LANE_STATE",
  "INVALID_UNAUTHORIZED_ACCESS",
  "INVALID_MISSING_ARTIFACT",
  "INVALID_ORACLE_EXPOSURE",
  "INVALID_TIMEOUT",
  "INVALID_CRASH",
  "INVALID_REPLAY_MISMATCH",
  "INVALID_RETRY_EXCEEDED",
];
const CELL_STATUSES = [
  "EVALUABLE",
  "NOT_EVALUABLE",
  "UNKNOWN",
  "UNSUPPORTED",
  "INPUT_UNOBSERVABLE",
  "INVALID_RUN",
];
const SOURCE_CLASSES = [
  "POLICY_RECORD",
  "PROJECT_RECORD",
  "PARTICIPANT_REPORT",
  "STATUS_RECORD",
  "SYNTHETIC_FILLER",
];
const EPISTEMIC_MARKERS = ["DIRECT", "REPORTED", "TENTATIVE", "UNKNOWN"];
const PROHIBITION_REASONS = ["STALE", "SUPERSEDED", "CONFLICTING", "UNRELATED"];
const QUALIFICATION_KINDS = [
  "SOURCE_PROVENANCE",
  "AUTHORITY_OR_UNCERTAINTY",
  "ABSTAIN_OR_QUALIFY",
];
const PACKET_KINDS = [
  "REFERENCE_FULL_PACKET",
  "EXACT_TEXT",
  "UNOBSERVED",
  "UNSUPPORTED",
  "INPUT_UNOBSERVABLE",
];
const TERMINALS = ["COMPLETED", "SAFE_FALLBACK", "UNKNOWN", "TIMEOUT", "CRASH"];

const INVALID_SPECS = [
  ["PH1-INV-01", "manifest.execution.timeout_ms", 5001, "INVALID_MANIFEST_CHANGED"],
  ["PH1-INV-02", "manifest.workload.corpus_file_sha256", "0".repeat(64), "INVALID_FIXTURE_DIGEST"],
  ["PH1-INV-03", "manifest.workload.oracle_file_sha256", "0".repeat(64), "INVALID_ORACLE_DIGEST"],
  ["PH1-INV-04", "manifest.workload.renderer_file_sha256", "0".repeat(64), "INVALID_RENDERER_DIGEST"],
  ["PH1-INV-05", "manifest.workload.case_ids", CASE_IDS.slice(0, 5), "INVALID_CASE_SET"],
  ["PH1-INV-06", "manifest.workload.case_order_rule", "REVERSED", "INVALID_CUTOFF_OR_ORDER"],
  ["PH1-INV-07", "observations.0.cross_lane_state", true, "INVALID_CROSS_LANE_STATE"],
  ["PH1-INV-08", "observations.0.unauthorized_access", true, "INVALID_UNAUTHORIZED_ACCESS"],
  ["PH1-INV-09", "observations.0.artifact_status", "MISSING", "INVALID_MISSING_ARTIFACT"],
  ["PH1-INV-10", "observations.0.oracle_exposed", true, "INVALID_ORACLE_EXPOSURE"],
  ["PH1-INV-11", "observations.0.terminal", "TIMEOUT", "INVALID_TIMEOUT"],
  ["PH1-INV-12", "observations.1.terminal", "CRASH", "INVALID_CRASH"],
  ["PH1-INV-13", "observations.2.replay_consistent", false, "INVALID_REPLAY_MISMATCH"],
  ["PH1-INV-14", "observations.3.retry_count", 1, "INVALID_RETRY_EXCEEDED"],
];

class FixtureError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "FixtureError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new FixtureError(code, detail);
}

function assert(condition, detail, code = "INVALID_CONTROL") {
  if (!condition) fail(code, detail);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

function validateUnicodeScalarString(value, detail) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      assert(next >= 0xdc00 && next <= 0xdfff, `${detail} contains an unpaired high surrogate`);
      index += 1;
    } else {
      assert(!(unit >= 0xdc00 && unit <= 0xdfff), `${detail} contains an unpaired low surrogate`);
    }
  }
}

class StrictJsonReader {
  constructor(source) {
    this.source = source;
    this.offset = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    assert(this.offset === this.source.length, `unexpected JSON text at byte offset ${this.offset}`);
    return value;
  }

  skipWhitespace() {
    while (/[\u0009\u000a\u000d\u0020]/u.test(this.source[this.offset] ?? "")) this.offset += 1;
  }

  parseValue() {
    const token = this.source[this.offset];
    if (token === "{") return this.parseObject();
    if (token === "[") return this.parseArray();
    if (token === '"') return this.parseString();
    if (token === "t" && this.source.slice(this.offset, this.offset + 4) === "true") {
      this.offset += 4;
      return true;
    }
    if (token === "f" && this.source.slice(this.offset, this.offset + 5) === "false") {
      this.offset += 5;
      return false;
    }
    if (token === "n" && this.source.slice(this.offset, this.offset + 4) === "null") {
      this.offset += 4;
      return null;
    }
    return this.parseNumber();
  }

  parseObject() {
    this.offset += 1;
    this.skipWhitespace();
    const result = {};
    const keys = new Set();
    if (this.source[this.offset] === "}") {
      this.offset += 1;
      return result;
    }
    while (true) {
      assert(this.source[this.offset] === '"', `object key expected at byte offset ${this.offset}`);
      const key = this.parseString();
      assert(!keys.has(key), `duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      this.skipWhitespace();
      assert(this.source[this.offset] === ":", `colon expected at byte offset ${this.offset}`);
      this.offset += 1;
      this.skipWhitespace();
      Object.defineProperty(result, key, {
        value: this.parseValue(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      this.skipWhitespace();
      if (this.source[this.offset] === "}") {
        this.offset += 1;
        return result;
      }
      assert(this.source[this.offset] === ",", `comma expected at byte offset ${this.offset}`);
      this.offset += 1;
      this.skipWhitespace();
    }
  }

  parseArray() {
    this.offset += 1;
    this.skipWhitespace();
    const result = [];
    if (this.source[this.offset] === "]") {
      this.offset += 1;
      return result;
    }
    while (true) {
      result.push(this.parseValue());
      this.skipWhitespace();
      if (this.source[this.offset] === "]") {
        this.offset += 1;
        return result;
      }
      assert(this.source[this.offset] === ",", `comma expected at byte offset ${this.offset}`);
      this.offset += 1;
      this.skipWhitespace();
    }
  }

  parseString() {
    const start = this.offset;
    this.offset += 1;
    let escaped = false;
    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      if (!escaped && character === '"') {
        this.offset += 1;
        const raw = this.source.slice(start, this.offset);
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          fail("INVALID_CONTROL", `invalid JSON string at byte offset ${start}`);
        }
        validateUnicodeScalarString(value, `string at byte offset ${start}`);
        return value;
      }
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
      this.offset += 1;
    }
    fail("INVALID_CONTROL", `unterminated JSON string at byte offset ${start}`);
  }

  parseNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(
      this.source.slice(this.offset)
    );
    assert(match !== null, `JSON value expected at byte offset ${this.offset}`);
    this.offset += match[0].length;
    const value = Number(match[0]);
    assert(Number.isFinite(value), `non-finite JSON number ${match[0]}`);
    assert(!Object.is(value, -0), "negative zero is not permitted");
    assert(!Number.isInteger(value) || Number.isSafeInteger(value), `unsafe integer ${match[0]}`);
    return value;
  }
}

function parseStrictJson(source) {
  return new StrictJsonReader(source).parse();
}

function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    validateUnicodeScalarString(value, "JSON string");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "non-finite number is not permitted");
    assert(!Object.is(value, -0), "negative zero is not permitted");
    assert(!Number.isInteger(value) || Number.isSafeInteger(value), "unsafe integer is not permitted");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  assert(isObject(value), "only plain JSON objects are canonicalizable");
  return `{${Object.keys(value)
    .sort(asciiCompare)
    .map((key) => `${canonicalize(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOrdinaryFile(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${path} must be an ordinary file`);
}

function readUtf8File(path) {
  assertOrdinaryFile(path);
  const bytes = readFileSync(path);
  assert(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${path} has a BOM`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("INVALID_CONTROL", `${path} is not strict UTF-8`);
  }
  assert(!text.includes("\r"), `${path} contains CR`);
  return { bytes, text };
}

function loadCanonicalJson(name) {
  const path = join(FIXTURE_DIRECTORY, name);
  const { bytes, text } = readUtf8File(path);
  assert(text.endsWith("\n") && !text.endsWith("\n\n"), `${name} must end in exactly one LF`);
  const valueText = text.slice(0, -1);
  const value = parseStrictJson(valueText);
  assert(canonicalize(value) === valueText, `${name} is not RFC 8785 JCS value bytes plus LF`);
  return {
    path,
    relative_path: relative(REPOSITORY_ROOT, path),
    bytes,
    text,
    value,
    value_text: valueText,
    file_sha256: sha256Bytes(bytes),
    value_sha256: sha256Text(valueText),
  };
}

function loadDraftJson(name) {
  const path = join(FIXTURE_DIRECTORY, name);
  const { text } = readUtf8File(path);
  return parseStrictJson(text);
}

function assertKeys(value, expected, detail) {
  assert(isObject(value), `${detail} must be an object`);
  const actual = Object.keys(value).sort(asciiCompare);
  const wanted = [...expected].sort(asciiCompare);
  assert(canonicalize(actual) === canonicalize(wanted), `${detail} has a non-closed shape`);
}

function assertArray(value, detail, length) {
  assert(Array.isArray(value), `${detail} must be an array`);
  if (length !== undefined) assert(value.length === length, `${detail} must contain ${length} entries`);
}

function assertString(value, detail, options = {}) {
  assert(typeof value === "string", `${detail} must be a string`);
  if (options.nonempty) assert(value.length > 0, `${detail} must be nonempty`);
  if (options.pattern) assert(options.pattern.test(value), `${detail} has an invalid identity`);
}

function assertBoolean(value, detail) {
  assert(typeof value === "boolean", `${detail} must be boolean`);
}

function assertInteger(value, detail, minimum = 0) {
  assert(Number.isSafeInteger(value) && value >= minimum, `${detail} must be a safe integer >= ${minimum}`);
}

function assertEnum(value, allowed, detail) {
  assert(allowed.includes(value), `${detail} is outside the closed enumeration`);
}

function assertExactArray(actual, expected, detail) {
  assertArray(actual, detail);
  assert(canonicalize(actual) === canonicalize(expected), `${detail} does not match the frozen order/content`);
}

function assertSortedUnique(values, detail) {
  assertArray(values, detail);
  assertExactArray(values, [...new Set(values)].sort(asciiCompare), detail);
}

function assertSha(value, detail) {
  assertString(value, detail, { pattern: /^[0-9a-f]{64}$/u });
}

function sequentialId(prefix, index) {
  return `${prefix}${String(index).padStart(4, "0")}`;
}

function round(value) {
  return Number(value.toFixed(6));
}

function deepClone(value) {
  return parseStrictJson(canonicalize(value));
}

function validateCorpus(corpus) {
  assertKeys(corpus, [
    "schema_version",
    "corpus_id",
    "classification",
    "selection_rule",
    "case_order_rule",
    "arm_neutrality_policy",
    "cases",
  ], "corpus");
  assert(corpus.schema_version === "rc-phase-one-corpus/1.0.0", "unexpected corpus schema");
  assert(corpus.corpus_id === CORPUS_ID, "unexpected corpus id");
  assert(
    corpus.classification === "PUBLIC_SYNTHETIC_NO_REAL_OR_PRIVATE_DATA",
    "unexpected corpus classification"
  );
  assert(corpus.selection_rule === "ALL_CASES", "corpus selection must be ALL_CASES");
  assert(corpus.case_order_rule === "ASCII_CASE_ID_ASCENDING", "unexpected case order rule");
  assert(
    corpus.arm_neutrality_policy === "SAME_CASE_CUTOFF_SCOPE_AND_AUTHORIZED_SOURCE_SET_V1",
    "unexpected arm-neutrality policy"
  );
  assertArray(corpus.cases, "corpus.cases", 6);
  assertExactArray(corpus.cases.map(({ case_id: caseId }) => caseId), CASE_IDS, "corpus case ids");

  const factIds = [];
  const sourceIds = [];
  const cutoffIds = [];
  const scenarioIds = [];
  for (let caseIndex = 0; caseIndex < corpus.cases.length; caseIndex += 1) {
    const item = corpus.cases[caseIndex];
    const [expectedCaseId, expectedCategory, expectedCutoff] = CASES[caseIndex];
    const path = `corpus.cases[${caseIndex}]`;
    assertKeys(item, [
      "case_id",
      "primary_category",
      "operation_scope",
      "common_cutoff",
      "sources",
      "current_input",
      "fallback_scenario",
    ], path);
    assert(item.case_id === expectedCaseId, `${path}.case_id mismatch`);
    assert(item.primary_category === expectedCategory, `${path}.primary_category mismatch`);
    assert(item.operation_scope === "PHASE_ONE_PUBLIC_SYNTHETIC", `${path}.operation_scope mismatch`);
    assertKeys(item.common_cutoff, ["cutoff_id", "visible_through_stream_seq"], `${path}.common_cutoff`);
    assertString(item.common_cutoff.cutoff_id, `${path}.common_cutoff.cutoff_id`, {
      pattern: /^FX-C\d{4}$/u,
    });
    cutoffIds.push(item.common_cutoff.cutoff_id);
    assert(
      item.common_cutoff.visible_through_stream_seq === expectedCutoff,
      `${path}.common_cutoff must resolve exactly`
    );
    assertArray(item.sources, `${path}.sources`, expectedCutoff);
    for (let sourceIndex = 0; sourceIndex < item.sources.length; sourceIndex += 1) {
      const source = item.sources[sourceIndex];
      const sourcePath = `${path}.sources[${sourceIndex}]`;
      assertKeys(source, [
        "source_id",
        "fact_id",
        "stream_seq",
        "source_class",
        "epistemic_marker",
        "text",
      ], sourcePath);
      assertString(source.source_id, `${sourcePath}.source_id`, { pattern: /^FX-S\d{4}$/u });
      assertString(source.fact_id, `${sourcePath}.fact_id`, { pattern: /^FX-F\d{4}$/u });
      assert(source.stream_seq === sourceIndex + 1, `${sourcePath}.stream_seq must be contiguous`);
      assertEnum(source.source_class, SOURCE_CLASSES, `${sourcePath}.source_class`);
      assertEnum(source.epistemic_marker, EPISTEMIC_MARKERS, `${sourcePath}.epistemic_marker`);
      assertString(source.text, `${sourcePath}.text`, { nonempty: true });
      assert(/synthetic/iu.test(source.text), `${sourcePath}.text must be visibly synthetic`);
      sourceIds.push(source.source_id);
      factIds.push(source.fact_id);
    }
    assertString(item.current_input, `${path}.current_input`, { nonempty: true });
    assert(/synthetic/iu.test(item.current_input), `${path}.current_input must be visibly synthetic`);
    assertKeys(item.fallback_scenario, ["scenario_id", "trigger"], `${path}.fallback_scenario`);
    assertString(item.fallback_scenario.scenario_id, `${path}.fallback_scenario.scenario_id`, {
      pattern: /^FX-X\d{4}$/u,
    });
    assertString(item.fallback_scenario.trigger, `${path}.fallback_scenario.trigger`, { nonempty: true });
    assert(/synthetic/iu.test(item.fallback_scenario.trigger), `${path} trigger must be visibly synthetic`);
    scenarioIds.push(item.fallback_scenario.scenario_id);
  }

  assertExactArray(
    factIds,
    Array.from({ length: 11 }, (_, index) => sequentialId("FX-F", index + 1)),
    "global fact ids"
  );
  assertExactArray(
    sourceIds,
    Array.from({ length: 11 }, (_, index) => sequentialId("FX-S", index + 1)),
    "global source ids"
  );
  assertExactArray(
    cutoffIds,
    Array.from({ length: 6 }, (_, index) => sequentialId("FX-C", index + 1)),
    "cutoff ids"
  );
  assertExactArray(
    scenarioIds,
    Array.from({ length: 6 }, (_, index) => sequentialId("FX-X", index + 1)),
    "scenario ids"
  );

  const forbiddenFragments = ["required", "prohibited", "gold", "oracle", "winner", "score", "d0", "d1", "d2"];
  scanStringsAndKeys(corpus, (value, path) => {
    const normalized = value.toLowerCase();
    for (const fragment of forbiddenFragments) {
      assert(!normalized.includes(fragment), `${path} contains forbidden corpus fragment ${fragment}`);
    }
    assert(!normalized.includes("expected terminal"), `${path} contains expected-terminal data`);
  });

  const oracleOnlyTokens = ["CONFLICTING", "UNRELATED", "ABSTAIN_OR_QUALIFY"];
  for (const item of corpus.cases) {
    scanStringsAndKeys(
      { sources: item.sources, current_input: item.current_input, fallback_scenario: item.fallback_scenario },
      (value, path) => {
        for (const token of oracleOnlyTokens) {
          assert(!value.includes(token), `${item.case_id}.${path} leaks oracle token ${token}`);
        }
      }
    );
  }

  const c04 = corpus.cases[3];
  assert(c04.sources.length === 1, "C04 must contain exactly one source");
  assert(
    ["TENTATIVE", "UNKNOWN"].includes(c04.sources[0].epistemic_marker),
    "C04 source must be tentative or unknown"
  );
  const c05 = corpus.cases[4];
  assert(c05.sources.length === 2, "C05 must contain exactly two sources");
  assert(c05.sources[1].source_class === "SYNTHETIC_FILLER", "C05 pressure source class mismatch");
  const c06 = corpus.cases[5];
  assert(c06.sources.length === 1, "C06 must contain only its single trigger-side source record");
  assert(
    c06.fallback_scenario.trigger.includes("no usable compiled packet"),
    "C06 must contain the frozen fallback trigger"
  );
}

function scanStringsAndKeys(value, visitor, path = "$") {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStringsAndKeys(item, visitor, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    visitor(key, `${path}.{key}`);
    scanStringsAndKeys(item, visitor, `${path}.${key}`);
  }
}

function validateOracle(oracle, corpus) {
  assertKeys(oracle, ["schema_version", "oracle_id", "classification", "corpus_id", "cases"], "oracle");
  assert(oracle.schema_version === "rc-phase-one-oracle/1.0.0", "unexpected oracle schema");
  assert(oracle.oracle_id === ORACLE_ID, "unexpected oracle id");
  assert(
    oracle.classification === "PUBLIC_SYNTHETIC_EVALUATOR_CONTROL_NOT_HIDDEN_HOLDOUT",
    "unexpected oracle classification"
  );
  assert(oracle.corpus_id === corpus.corpus_id, "oracle corpus id mismatch");
  assertArray(oracle.cases, "oracle.cases", 6);
  assertExactArray(oracle.cases.map(({ case_id: caseId }) => caseId), CASE_IDS, "oracle case ids");

  const qualificationIds = [];
  const expectedControl = [
    { required: ["FX-F0001"], supported: ["FX-F0001"], reasons: ["UNRELATED"], qualifications: [], fallback: false },
    { required: ["FX-F0005"], supported: ["FX-F0005"], reasons: ["STALE", "SUPERSEDED"], qualifications: [], fallback: false },
    { required: ["FX-F0006"], supported: ["FX-F0006"], reasons: ["CONFLICTING"], qualifications: ["SOURCE_PROVENANCE", "AUTHORITY_OR_UNCERTAINTY"], fallback: false },
    { required: [], supported: ["FX-F0008"], reasons: [], qualifications: ["ABSTAIN_OR_QUALIFY"], fallback: false },
    { required: ["FX-F0009"], supported: ["FX-F0009"], reasons: ["UNRELATED"], qualifications: [], fallback: false },
    { required: ["FX-F0011"], supported: ["FX-F0011"], reasons: [], qualifications: [], fallback: true },
  ];
  for (let index = 0; index < oracle.cases.length; index += 1) {
    const item = oracle.cases[index];
    const corpusCase = corpus.cases[index];
    const expected = expectedControl[index];
    const path = `oracle.cases[${index}]`;
    assertKeys(item, [
      "case_id",
      "required_fact_ids",
      "supported_fact_ids",
      "prohibitions",
      "qualification_labels",
      "fallback_expected",
    ], path);
    assert(item.case_id === corpusCase.case_id, `${path}.case_id mismatch`);
    assertSortedUnique(item.required_fact_ids, `${path}.required_fact_ids`);
    assertSortedUnique(item.supported_fact_ids, `${path}.supported_fact_ids`);
    assertExactArray(item.required_fact_ids, expected.required, `${path}.required_fact_ids`);
    assertExactArray(item.supported_fact_ids, expected.supported, `${path}.supported_fact_ids`);
    assertArray(item.prohibitions, `${path}.prohibitions`, expected.reasons.length);
    assertArray(item.qualification_labels, `${path}.qualification_labels`, expected.qualifications.length);
    assertBoolean(item.fallback_expected, `${path}.fallback_expected`);
    assert(item.fallback_expected === expected.fallback, `${path}.fallback_expected mismatch`);

    const corpusFacts = new Set(corpusCase.sources.map(({ fact_id: factId }) => factId));
    const supported = new Set(item.supported_fact_ids);
    for (const factId of item.required_fact_ids) {
      assert(corpusFacts.has(factId), `${path} required fact is not cutoff-visible`);
      assert(supported.has(factId), `${path} required fact must be supported`);
    }
    const prohibited = new Set();
    const reasons = [];
    for (let prohibitionIndex = 0; prohibitionIndex < item.prohibitions.length; prohibitionIndex += 1) {
      const prohibition = item.prohibitions[prohibitionIndex];
      const prohibitionPath = `${path}.prohibitions[${prohibitionIndex}]`;
      assertKeys(prohibition, ["fact_id", "reason"], prohibitionPath);
      assertString(prohibition.fact_id, `${prohibitionPath}.fact_id`, { pattern: /^FX-F\d{4}$/u });
      assertEnum(prohibition.reason, PROHIBITION_REASONS, `${prohibitionPath}.reason`);
      assert(corpusFacts.has(prohibition.fact_id), `${prohibitionPath} fact is not cutoff-visible`);
      assert(!prohibited.has(prohibition.fact_id), `${prohibitionPath} duplicates a fact`);
      assert(!supported.has(prohibition.fact_id), `${prohibitionPath} overlaps supported facts`);
      prohibited.add(prohibition.fact_id);
      reasons.push(prohibition.reason);
    }
    assertExactArray(reasons, expected.reasons, `${path} prohibition reasons`);
    assertExactArray(
      [...supported, ...prohibited].sort(asciiCompare),
      [...corpusFacts].sort(asciiCompare),
      `${path} fact classification closure`
    );

    const qualificationKinds = [];
    for (let qualificationIndex = 0; qualificationIndex < item.qualification_labels.length; qualificationIndex += 1) {
      const qualification = item.qualification_labels[qualificationIndex];
      const qualificationPath = `${path}.qualification_labels[${qualificationIndex}]`;
      assertKeys(qualification, ["qualification_id", "marker", "kind"], qualificationPath);
      assertString(qualification.qualification_id, `${qualificationPath}.qualification_id`, {
        pattern: /^FX-Q\d{4}$/u,
      });
      assertString(qualification.marker, `${qualificationPath}.marker`, { nonempty: true });
      assertEnum(qualification.kind, QUALIFICATION_KINDS, `${qualificationPath}.kind`);
      qualificationIds.push(qualification.qualification_id);
      qualificationKinds.push(qualification.kind);
    }
    assertExactArray(qualificationKinds, expected.qualifications, `${path} qualification kinds`);
  }
  assertExactArray(
    qualificationIds,
    Array.from({ length: 3 }, (_, index) => sequentialId("FX-Q", index + 1)),
    "qualification ids"
  );
  assert(
    oracle.cases[2].qualification_labels[0].marker === "[[SOURCE_FX-S0006]]" &&
      oracle.cases[2].qualification_labels[1].marker === "[[AUTHORITY_OR_UNCERTAIN]]" &&
      oracle.cases[3].qualification_labels[0].marker === "[[ABSTAIN_OR_QUALIFY]]",
    "qualification markers do not match the frozen registry"
  );
}

function renderCase(corpusCase) {
  const visible = corpusCase.sources
    .filter(({ stream_seq: streamSeq }) => streamSeq <= corpusCase.common_cutoff.visible_through_stream_seq)
    .sort((left, right) => left.stream_seq - right.stream_seq || asciiCompare(left.fact_id, right.fact_id));
  const history = visible
    .map((source) =>
      `[${source.fact_id}|${source.source_id}|${source.source_class}|${source.epistemic_marker}] ${source.text}\n`
    )
    .join("");
  const fullPacket = `${history}[CURRENT_INPUT] ${corpusCase.current_input}\n`;
  return { history, fullPacket };
}

function estimateTokens(text) {
  return text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4));
}

function deriveRenderer(corpus) {
  validateCorpus(corpus);
  return {
    schema_version: "rc-phase-one-renderer-profile/1.0.0",
    renderer_id: RENDERER_ID,
    tokenizer_id: TOKENIZER_ID,
    normalization_id: NORMALIZATION_ID,
    fact_order: "STREAM_SEQ_ASC_FACT_ID_ASC",
    case_renderings: corpus.cases.map((item) => {
      const { history, fullPacket } = renderCase(item);
      return {
        case_id: item.case_id,
        d0_history_utf8_bytes: Buffer.byteLength(history, "utf8"),
        full_packet_utf8_bytes: Buffer.byteLength(fullPacket, "utf8"),
        full_packet_sha256: sha256Text(fullPacket),
        declared_context_units: estimateTokens(fullPacket),
        evidence_status: "ESTIMATED",
      };
    }),
  };
}

function validateRenderer(renderer, corpus) {
  assertKeys(renderer, [
    "schema_version",
    "renderer_id",
    "tokenizer_id",
    "normalization_id",
    "fact_order",
    "case_renderings",
  ], "renderer");
  assert(renderer.schema_version === "rc-phase-one-renderer-profile/1.0.0", "unexpected renderer schema");
  assert(renderer.renderer_id === RENDERER_ID, "unexpected renderer id");
  assert(renderer.tokenizer_id === TOKENIZER_ID, "unexpected tokenizer id");
  assert(renderer.normalization_id === NORMALIZATION_ID, "unexpected normalization id");
  assert(renderer.fact_order === "STREAM_SEQ_ASC_FACT_ID_ASC", "unexpected renderer fact order");
  const derived = deriveRenderer(corpus);
  assert(canonicalize(renderer) === canonicalize(derived), "renderer does not reproduce exact case bytes/units");
  assert(
    renderer.case_renderings[4].d0_history_utf8_bytes >= 32768,
    "C05 D0 history must be at least 32,768 UTF-8 bytes"
  );
}

function manifestWithoutRunId(manifest) {
  const result = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (key !== "run_id") Object.defineProperty(result, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function computeRunId(manifest) {
  return `RUN-SHA256-${sha256Text(canonicalize(manifestWithoutRunId(manifest)))}`;
}

function materializeManifestFixtures(fixtures, corpusDescriptor, oracleDescriptor, rendererDescriptor) {
  const result = deepClone(fixtures);
  const tokens = new Map([
    ["__CORPUS_FILE_SHA256__", corpusDescriptor.file_sha256],
    ["__CORPUS_VALUE_SHA256__", corpusDescriptor.value_sha256],
    ["__ORACLE_FILE_SHA256__", oracleDescriptor.file_sha256],
    ["__ORACLE_VALUE_SHA256__", oracleDescriptor.value_sha256],
    ["__RENDERER_FILE_SHA256__", rendererDescriptor.file_sha256],
    ["__RENDERER_VALUE_SHA256__", rendererDescriptor.value_sha256],
  ]);
  corpusDescriptor.value.cases.forEach((item, index) => {
    tokens.set(`__CURRENT_INPUT_SHA_PH1_C0${index + 1}__`, sha256Text(item.current_input));
  });
  replaceStringTokens(result, tokens);
  result.positive_control.manifest.run_id = computeRunId(result.positive_control.manifest);
  return result;
}

function replaceStringTokens(value, tokens) {
  if (Array.isArray(value)) {
    value.forEach((item) => replaceStringTokens(item, tokens));
    return;
  }
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item === "string" && tokens.has(item)) value[key] = tokens.get(item);
    else replaceStringTokens(item, tokens);
  }
}

function validateManifestFixtures(fixtures, descriptors) {
  assertKeys(fixtures, [
    "schema_version",
    "contract_id",
    "template",
    "positive_control",
    "invalid_controls",
  ], "run-manifest fixtures");
  assert(
    fixtures.schema_version === "rc-phase-one-run-manifest-fixtures/1.0.0",
    "unexpected run-manifest fixture schema"
  );
  assert(fixtures.contract_id === "RC_PHASE1_RUN_MANIFEST_V1", "unexpected manifest contract id");
  validateManifestShape(fixtures.template, "template");
  validateTemplate(fixtures.template, descriptors);
  assertKeys(fixtures.positive_control, ["manifest", "observations"], "positive_control");
  validateManifestShape(fixtures.positive_control.manifest, "positive manifest");
  validateObservationShapes(fixtures.positive_control.observations);
  validateRunControl(fixtures.positive_control, descriptors);
  validateInvalidControlShapes(fixtures.invalid_controls);
  return reproduceInvalidControls(fixtures, descriptors);
}

function validateManifestShape(manifest, detail) {
  assertKeys(manifest, [
    "schema_version",
    "contract_id",
    "run_id",
    "run_kind",
    "roster",
    "integration",
    "workload",
    "arms",
    "execution",
    "invalid_run_rules",
    "sanitized_artifact_locations",
    "qa",
  ], detail);
  assert(manifest.schema_version === "rc-phase-one-run-manifest/1.0.0", `${detail} schema mismatch`);
  assert(manifest.contract_id === "RC_PHASE1_RUN_MANIFEST_V1", `${detail} contract mismatch`);
  assertString(manifest.run_id, `${detail}.run_id`, { nonempty: true });
  assertEnum(manifest.run_kind, ["TEMPLATE_NOT_RUN", "VALIDATOR_CONFORMANCE_ONLY"], `${detail}.run_kind`);
  assertKeys(manifest.roster, ["revision", "status", "host_id", "host_version"], `${detail}.roster`);
  Object.entries(manifest.roster).forEach(([key, value]) => assertString(value, `${detail}.roster.${key}`, { nonempty: true }));

  assertKeys(manifest.integration, [
    "revision",
    "repository_commits",
    "package_digests",
    "node_version",
    "toolchain",
    "feature_flags",
  ], `${detail}.integration`);
  assertString(manifest.integration.revision, `${detail}.integration.revision`, { nonempty: true });
  assertArray(manifest.integration.repository_commits, `${detail}.integration.repository_commits`);
  assert(manifest.integration.repository_commits.length > 0, `${detail}.integration.repository_commits is empty`);
  manifest.integration.repository_commits.forEach((item, index) => {
    assertKeys(item, ["repository", "commit"], `${detail}.integration.repository_commits[${index}]`);
    assertString(item.repository, `${detail}.integration.repository_commits[${index}].repository`, { nonempty: true });
    assertString(item.commit, `${detail}.integration.repository_commits[${index}].commit`, { nonempty: true });
  });
  assertArray(manifest.integration.package_digests, `${detail}.integration.package_digests`);
  assert(manifest.integration.package_digests.length > 0, `${detail}.integration.package_digests is empty`);
  manifest.integration.package_digests.forEach((item, index) => {
    assertKeys(item, ["package", "sha256"], `${detail}.integration.package_digests[${index}]`);
    assertString(item.package, `${detail}.integration.package_digests[${index}].package`, { nonempty: true });
    assertString(item.sha256, `${detail}.integration.package_digests[${index}].sha256`, { nonempty: true });
  });
  assertString(manifest.integration.node_version, `${detail}.integration.node_version`, { nonempty: true });
  assertArray(manifest.integration.toolchain, `${detail}.integration.toolchain`);
  assertArray(manifest.integration.feature_flags, `${detail}.integration.feature_flags`);

  assertKeys(manifest.workload, [
    "corpus_id",
    "corpus_file_sha256",
    "corpus_value_sha256",
    "oracle_id",
    "oracle_file_sha256",
    "oracle_value_sha256",
    "renderer_id",
    "renderer_file_sha256",
    "renderer_value_sha256",
    "tokenizer_id",
    "case_order_rule",
    "case_ids",
    "case_bindings",
  ], `${detail}.workload`);
  [
    "corpus_id",
    "corpus_file_sha256",
    "corpus_value_sha256",
    "oracle_id",
    "oracle_file_sha256",
    "oracle_value_sha256",
    "renderer_id",
    "renderer_file_sha256",
    "renderer_value_sha256",
    "tokenizer_id",
    "case_order_rule",
  ].forEach((key) => assertString(manifest.workload[key], `${detail}.workload.${key}`, { nonempty: true }));
  assertArray(manifest.workload.case_ids, `${detail}.workload.case_ids`);
  assertArray(manifest.workload.case_bindings, `${detail}.workload.case_bindings`);
  manifest.workload.case_bindings.forEach((binding, index) => {
    const path = `${detail}.workload.case_bindings[${index}]`;
    assertKeys(binding, [
      "case_id",
      "cutoff_id",
      "visible_through_stream_seq",
      "operation_scope",
      "authorized_source_ids",
      "current_input_sha256",
    ], path);
    assertString(binding.case_id, `${path}.case_id`, { nonempty: true });
    assertString(binding.cutoff_id, `${path}.cutoff_id`, { nonempty: true });
    assertInteger(binding.visible_through_stream_seq, `${path}.visible_through_stream_seq`, 1);
    assertString(binding.operation_scope, `${path}.operation_scope`, { nonempty: true });
    assertArray(binding.authorized_source_ids, `${path}.authorized_source_ids`);
    binding.authorized_source_ids.forEach((id, idIndex) =>
      assertString(id, `${path}.authorized_source_ids[${idIndex}]`, { pattern: /^FX-S\d{4}$/u })
    );
    assertString(binding.current_input_sha256, `${path}.current_input_sha256`, { nonempty: true });
  });

  assertArray(manifest.arms, `${detail}.arms`);
  assertKeys(manifest.execution, [
    "authorization_lane",
    "evidence_lane",
    "observed_boundary",
    "allowed_inputs",
    "explicit_exclusions",
    "seed",
    "case_order",
    "randomization_rule",
    "warm_up_runs",
    "repetitions",
    "timeout_ms",
    "retry_maximum",
    "concurrency",
    "resource_envelope",
  ], `${detail}.execution`);
  [
    "authorization_lane",
    "evidence_lane",
    "observed_boundary",
    "seed",
    "randomization_rule",
    "resource_envelope",
  ].forEach((key) => assertString(manifest.execution[key], `${detail}.execution.${key}`, { nonempty: true }));
  ["allowed_inputs", "explicit_exclusions", "case_order"].forEach((key) =>
    assertArray(manifest.execution[key], `${detail}.execution.${key}`)
  );
  ["warm_up_runs", "repetitions", "timeout_ms", "retry_maximum", "concurrency"].forEach((key) => {
    const value = manifest.execution[key];
    assert(
      value === "REQUIRED_UNSET" || (Number.isSafeInteger(value) && value >= 0),
      `${detail}.execution.${key} must be a nonnegative integer or REQUIRED_UNSET`
    );
  });
  assertArray(manifest.invalid_run_rules, `${detail}.invalid_run_rules`);
  assertArray(manifest.sanitized_artifact_locations, `${detail}.sanitized_artifact_locations`);
  assertKeys(manifest.qa, ["module_qa_identity", "submission_qa_identity"], `${detail}.qa`);
  assertString(manifest.qa.module_qa_identity, `${detail}.qa.module_qa_identity`, { nonempty: true });
  assertString(manifest.qa.submission_qa_identity, `${detail}.qa.submission_qa_identity`, { nonempty: true });
}

function validateTemplate(template, descriptors) {
  assert(template.run_kind === "TEMPLATE_NOT_RUN", "template kind mismatch");
  assert(template.run_id === "REQUIRED_UNSET", "template run id must remain unset");
  assert(containsRequiredUnset(template), "template must contain required-unset sentinels");
  assertExactArray(template.arms, ARMS, "template arms");
  assertExactArray(template.invalid_run_rules, INVALID_CODES, "template invalid rules");
  validateWorkloadDigests(template.workload, descriptors);
  validateCaseBindings(template.workload, descriptors.corpus.value, true);
  assertTemplateCannotMeasure(template);
}

function assertTemplateCannotMeasure(template) {
  try {
    validateMeasuredManifest(template);
  } catch (error) {
    assert(error instanceof FixtureError && error.code === "INVALID_MANIFEST_CHANGED", "template rejection code mismatch");
    return;
  }
  fail("INVALID_CONTROL", "template unexpectedly validates for measurement");
}

function validateMeasuredManifest(manifest) {
  if (manifest.run_kind !== "VALIDATOR_CONFORMANCE_ONLY" || containsRequiredUnset(manifest)) {
    fail("INVALID_MANIFEST_CHANGED", "manifest is not complete for a conformance run");
  }
}

function containsRequiredUnset(value) {
  if (value === "REQUIRED_UNSET") return true;
  if (Array.isArray(value)) return value.some(containsRequiredUnset);
  if (isObject(value)) return Object.values(value).some(containsRequiredUnset);
  return false;
}

function validateWorkloadDigests(workload, descriptors) {
  if (
    workload.corpus_id !== CORPUS_ID ||
    workload.corpus_file_sha256 !== descriptors.corpus.file_sha256 ||
    workload.corpus_value_sha256 !== descriptors.corpus.value_sha256
  ) {
    fail("INVALID_FIXTURE_DIGEST", "corpus digest binding mismatch");
  }
  if (
    workload.oracle_id !== ORACLE_ID ||
    workload.oracle_file_sha256 !== descriptors.oracle.file_sha256 ||
    workload.oracle_value_sha256 !== descriptors.oracle.value_sha256
  ) {
    fail("INVALID_ORACLE_DIGEST", "oracle digest binding mismatch");
  }
  if (
    workload.renderer_id !== RENDERER_ID ||
    workload.renderer_file_sha256 !== descriptors.renderer.file_sha256 ||
    workload.renderer_value_sha256 !== descriptors.renderer.value_sha256 ||
    workload.tokenizer_id !== TOKENIZER_ID
  ) {
    fail("INVALID_RENDERER_DIGEST", "renderer/tokenizer digest binding mismatch");
  }
}

function validateCaseBindings(workload, corpus, templateMode = false) {
  if (canonicalize(workload.case_ids) !== canonicalize(CASE_IDS)) {
    fail("INVALID_CASE_SET", "manifest case set mismatch");
  }
  if (workload.case_order_rule !== "ASCII_CASE_ID_ASCENDING") {
    fail("INVALID_CUTOFF_OR_ORDER", "manifest case order rule mismatch");
  }
  if (!templateMode && canonicalize(workload.case_ids) !== canonicalize(workload.case_ids.slice().sort(asciiCompare))) {
    fail("INVALID_CUTOFF_OR_ORDER", "manifest case ids are not ASCII ordered");
  }
  if (workload.case_bindings.length !== corpus.cases.length) {
    fail("INVALID_CUTOFF_OR_ORDER", "manifest case binding count mismatch");
  }
  for (let index = 0; index < corpus.cases.length; index += 1) {
    const corpusCase = corpus.cases[index];
    const binding = workload.case_bindings[index];
    const expected = {
      case_id: corpusCase.case_id,
      cutoff_id: corpusCase.common_cutoff.cutoff_id,
      visible_through_stream_seq: corpusCase.common_cutoff.visible_through_stream_seq,
      operation_scope: corpusCase.operation_scope,
      authorized_source_ids: corpusCase.sources
        .filter(({ stream_seq: streamSeq }) => streamSeq <= corpusCase.common_cutoff.visible_through_stream_seq)
        .map(({ source_id: sourceId }) => sourceId),
      current_input_sha256: sha256Text(corpusCase.current_input),
    };
    if (canonicalize(binding) !== canonicalize(expected)) {
      fail("INVALID_CUTOFF_OR_ORDER", `manifest binding mismatch for ${corpusCase.case_id}`);
    }
  }
}

function validateObservationShapes(observations) {
  assertArray(observations, "positive_control.observations");
  observations.forEach((observation, index) => {
    const path = `positive_control.observations[${index}]`;
    assertKeys(observation, [
      "case_id",
      "arm_id",
      "host_id",
      "primary_category",
      "authorization_lane",
      "evidence_lane",
      "observed_boundary",
      "packet_observation",
      "terminal",
      "fallback_preserved",
      "artifact_status",
      "cross_lane_state",
      "unauthorized_access",
      "oracle_exposed",
      "replay_consistent",
      "retry_count",
    ], path);
    [
      "case_id",
      "arm_id",
      "host_id",
      "primary_category",
      "authorization_lane",
      "evidence_lane",
      "observed_boundary",
      "terminal",
      "artifact_status",
    ].forEach((key) => assertString(observation[key], `${path}.${key}`, { nonempty: true }));
    assertKeys(observation.packet_observation, ["kind", "text"], `${path}.packet_observation`);
    assertEnum(observation.packet_observation.kind, PACKET_KINDS, `${path}.packet_observation.kind`);
    assert(
      observation.packet_observation.text === null || typeof observation.packet_observation.text === "string",
      `${path}.packet_observation.text must be string or null`
    );
    assertEnum(observation.terminal, TERMINALS, `${path}.terminal`);
    assert(
      observation.fallback_preserved === null || typeof observation.fallback_preserved === "boolean",
      `${path}.fallback_preserved must be boolean or null`
    );
    assertEnum(observation.artifact_status, ["PRESENT", "MISSING"], `${path}.artifact_status`);
    ["cross_lane_state", "unauthorized_access", "oracle_exposed", "replay_consistent"].forEach((key) =>
      assertBoolean(observation[key], `${path}.${key}`)
    );
    assertInteger(observation.retry_count, `${path}.retry_count`, 0);
  });
}

function validateInvalidControlShapes(invalidControls) {
  assertArray(invalidControls, "invalid_controls", INVALID_SPECS.length);
  for (let index = 0; index < invalidControls.length; index += 1) {
    const item = invalidControls[index];
    const [fixtureId, target, value, errorCode] = INVALID_SPECS[index];
    const expected = {
      fixture_id: fixtureId,
      mutation: { operation: "REPLACE", target, value },
      expected_error_code: errorCode,
    };
    assert(canonicalize(item) === canonicalize(expected), `invalid_controls[${index}] is not the frozen one-cause mutation`);
  }
}

function validateRunControl(control, descriptors) {
  const { manifest, observations } = control;
  validateMeasuredManifest(manifest);
  validateWorkloadDigests(manifest.workload, descriptors);
  validateCaseBindings(manifest.workload, descriptors.corpus.value);
  if (canonicalize(manifest.arms) !== canonicalize(ARMS)) {
    fail("INVALID_CROSS_LANE_STATE", "manifest arms differ from the frozen three-arm matrix");
  }
  if (canonicalize(manifest.invalid_run_rules) !== canonicalize(INVALID_CODES)) {
    fail("INVALID_MANIFEST_CHANGED", "invalid-run rule list changed");
  }
  if (canonicalize(manifest.execution.case_order) !== canonicalize(CASE_IDS)) {
    fail("INVALID_CUTOFF_OR_ORDER", "execution case order mismatch");
  }
  if (
    manifest.execution.authorization_lane !== "PUBLIC_SYNTHETIC_FIXTURE" ||
    manifest.execution.evidence_lane !== "VALIDATOR_CONFORMANCE_ONLY" ||
    manifest.execution.observed_boundary !== "CONTEXT_PACKET_BEFORE_MODEL"
  ) {
    fail("INVALID_CROSS_LANE_STATE", "execution lane/boundary mismatch");
  }
  if (
    canonicalize(manifest.execution.allowed_inputs) !==
      canonicalize(["PUBLIC_SYNTHETIC_CORPUS", "PUBLIC_SYNTHETIC_CURRENT_INPUT"])
  ) {
    fail("INVALID_UNAUTHORIZED_ACCESS", "allowed input set changed");
  }
  if (
    canonicalize(manifest.execution.explicit_exclusions) !==
      canonicalize(["EVALUATOR_CONTROL_ORACLE", "FUTURE_OR_CUTOFF_HIDDEN_INPUT", "PRIVATE_OR_REAL_DATA"])
  ) {
    fail("INVALID_ORACLE_EXPOSURE", "oracle/private/future exclusions changed");
  }
  if (
    manifest.execution.seed !== "NOT_APPLICABLE" ||
    manifest.execution.randomization_rule !== "NONE_ASCII_ORDER" ||
    manifest.execution.warm_up_runs !== 0 ||
    manifest.execution.repetitions !== 1 ||
    manifest.execution.retry_maximum !== 0 ||
    manifest.execution.concurrency !== 1 ||
    manifest.execution.resource_envelope !== "SINGLE_PROCESS_NODE_BUILTINS"
  ) {
    fail("INVALID_MANIFEST_CHANGED", "conformance execution parameters changed");
  }
  assertInteger(manifest.execution.timeout_ms, "positive timeout_ms", 1);
  if (
    manifest.roster.host_id !== "REFERENCE_FIXTURE_NOT_A_HOST" ||
    manifest.roster.host_version !== "NOT_APPLICABLE" ||
    manifest.roster.status !== "CANDIDATE_EVIDENCE_ROSTER" ||
    manifest.run_kind !== "VALIDATOR_CONFORMANCE_ONLY"
  ) {
    fail("INVALID_MANIFEST_CHANGED", "conformance identity changed or implies a Host run");
  }
  if (
    canonicalize(manifest.sanitized_artifact_locations) !==
      canonicalize(["temporary://normalized-result.json"])
  ) {
    fail("INVALID_MISSING_ARTIFACT", "sanitized temporary artifact location mismatch");
  }
  if (
    manifest.qa.module_qa_identity !== "CONFORMANCE_ONLY_NOT_ACCEPTANCE" ||
    manifest.qa.submission_qa_identity !== "CONFORMANCE_ONLY_NOT_ACCEPTANCE"
  ) {
    fail("INVALID_MANIFEST_CHANGED", "conformance fixture cannot claim QA acceptance");
  }
  if (observations.length !== CASE_IDS.length * ARMS.length) {
    fail("INVALID_CASE_SET", "observation matrix is incomplete");
  }

  const seenCells = new Set();
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    const expectedCase = CASE_IDS[Math.floor(index / ARMS.length)];
    const expectedArm = ARMS[index % ARMS.length];
    const cellKey = `${observation.case_id}\u0000${observation.arm_id}`;
    if (seenCells.has(cellKey) || observation.case_id !== expectedCase || observation.arm_id !== expectedArm) {
      fail("INVALID_CROSS_LANE_STATE", "observation cells are duplicated, missing, or reordered");
    }
    seenCells.add(cellKey);
    if (
      observation.host_id !== manifest.roster.host_id ||
      observation.primary_category !== CATEGORY_BY_CASE.get(observation.case_id) ||
      observation.authorization_lane !== manifest.execution.authorization_lane ||
      observation.evidence_lane !== manifest.execution.evidence_lane ||
      observation.observed_boundary !== manifest.execution.observed_boundary
    ) {
      fail("INVALID_CROSS_LANE_STATE", `cell fairness binding mismatch at observation ${index}`);
    }
    const { kind, text } = observation.packet_observation;
    if (
      (kind === "EXACT_TEXT" && (typeof text !== "string" || text.length === 0)) ||
      (kind !== "EXACT_TEXT" && text !== null)
    ) {
      fail("INVALID_MISSING_ARTIFACT", `packet observation payload mismatch at observation ${index}`);
    }
  }

  if (observations.some(({ cross_lane_state: value }) => value)) {
    fail("INVALID_CROSS_LANE_STATE", "cross-lane state was observed");
  }
  if (observations.some(({ unauthorized_access: value }) => value)) {
    fail("INVALID_UNAUTHORIZED_ACCESS", "unauthorized access was observed");
  }
  if (observations.some(({ artifact_status: value }) => value !== "PRESENT")) {
    fail("INVALID_MISSING_ARTIFACT", "a required observation artifact is missing");
  }
  if (observations.some(({ oracle_exposed: value }) => value)) {
    fail("INVALID_ORACLE_EXPOSURE", "oracle was exposed at the arm boundary");
  }
  if (observations.some(({ terminal }) => terminal === "TIMEOUT")) {
    fail("INVALID_TIMEOUT", "a frozen cell timed out");
  }
  if (observations.some(({ terminal }) => terminal === "CRASH")) {
    fail("INVALID_CRASH", "a frozen cell crashed");
  }
  if (observations.some(({ replay_consistent: value }) => !value)) {
    fail("INVALID_REPLAY_MISMATCH", "a frozen cell changed during replay");
  }
  if (observations.some(({ retry_count: count }) => count > manifest.execution.retry_maximum)) {
    fail("INVALID_RETRY_EXCEEDED", "a frozen cell exceeded the retry maximum");
  }
  const expectedRunId = computeRunId(manifest);
  if (manifest.run_id !== expectedRunId) {
    fail("INVALID_MANIFEST_CHANGED", "run id does not bind the complete manifest");
  }
}

function reproduceInvalidControls(fixtures, descriptors) {
  return fixtures.invalid_controls.map((invalidControl) => {
    const mutated = deepClone(fixtures.positive_control);
    applyMutation(mutated, invalidControl.mutation);
    let actualCode = null;
    try {
      validateManifestShape(mutated.manifest, `${invalidControl.fixture_id}.manifest`);
      validateObservationShapes(mutated.observations);
      validateRunControl(mutated, descriptors);
    } catch (error) {
      if (error instanceof FixtureError) actualCode = error.code;
      else throw error;
    }
    assert(
      actualCode === invalidControl.expected_error_code,
      `${invalidControl.fixture_id} produced ${actualCode ?? "NO_ERROR"}, expected ${invalidControl.expected_error_code}`
    );
    return {
      fixture_id: invalidControl.fixture_id,
      error_code: actualCode,
      status: "INVALID_RUN",
    };
  });
}

function applyMutation(target, mutation) {
  assertKeys(mutation, ["operation", "target", "value"], "mutation");
  assert(mutation.operation === "REPLACE", "only frozen REPLACE mutations are allowed");
  const segments = mutation.target.split(".");
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    assert(
      (isObject(cursor) || Array.isArray(cursor)) && Object.hasOwn(cursor, segment),
      `mutation target ${mutation.target} does not exist`
    );
    cursor = cursor[segment];
  }
  const finalSegment = segments.at(-1);
  assert(
    (isObject(cursor) || Array.isArray(cursor)) && Object.hasOwn(cursor, finalSegment),
    `mutation target ${mutation.target} does not exist`
  );
  cursor[finalSegment] = deepClone(mutation.value);
}

function materializePacket(observation, corpusCase) {
  if (observation.packet_observation.kind === "REFERENCE_FULL_PACKET") {
    return { status: "EVALUABLE", text: renderCase(corpusCase).fullPacket };
  }
  if (observation.packet_observation.kind === "EXACT_TEXT") {
    return { status: "EVALUABLE", text: observation.packet_observation.text };
  }
  if (observation.packet_observation.kind === "UNOBSERVED") {
    return { status: "UNKNOWN", text: null };
  }
  if (observation.packet_observation.kind === "UNSUPPORTED") {
    return { status: "UNSUPPORTED", text: null };
  }
  return { status: "INPUT_UNOBSERVABLE", text: null };
}

function emptyStatusMetric(status) {
  return { status, numerator: null, denominator: null, rate: null };
}

function rateMetric(numerator, denominator) {
  if (denominator === 0) return { status: "NOT_EVALUABLE", numerator: 0, denominator: 0, rate: null };
  return { status: "EVALUABLE", numerator, denominator, rate: round(numerator / denominator) };
}

function unitsMetric(packet) {
  if (packet.status !== "EVALUABLE") {
    return {
      status: packet.status,
      value: null,
      evidence_quality: null,
      estimator_id: TOKENIZER_ID,
    };
  }
  return {
    status: "EVALUABLE",
    value: estimateTokens(packet.text),
    evidence_quality: "ESTIMATED",
    estimator_id: TOKENIZER_ID,
  };
}

function recognizedFactIds(text) {
  const result = new Set();
  const pattern = /(?:^|[^A-Z0-9-])(FX-F\d{4})(?![A-Z0-9-])/gu;
  for (const match of text.matchAll(pattern)) result.add(match[1]);
  return [...result].sort(asciiCompare);
}

function evaluateCell(observation, corpusCase, oracleCase) {
  const packet = materializePacket(observation, corpusCase);
  const statusOnly = packet.status === "EVALUABLE" ? null : packet.status;
  let requiredFactRecall;
  let supportedPrecision;
  let staleConflictLeakage;
  let provenanceUncertaintyFidelity;
  let unrelatedInclusionCount = null;
  if (statusOnly !== null) {
    requiredFactRecall = emptyStatusMetric(statusOnly);
    supportedPrecision = emptyStatusMetric(statusOnly);
    staleConflictLeakage = emptyStatusMetric(statusOnly);
    provenanceUncertaintyFidelity = emptyStatusMetric(statusOnly);
  } else {
    const observedFacts = recognizedFactIds(packet.text);
    const observedSet = new Set(observedFacts);
    const required = oracleCase.required_fact_ids;
    const supported = new Set(oracleCase.supported_fact_ids);
    const leakageControls = oracleCase.prohibitions.filter(({ reason }) =>
      ["STALE", "SUPERSEDED", "CONFLICTING"].includes(reason)
    );
    requiredFactRecall = rateMetric(
      required.filter((factId) => observedSet.has(factId)).length,
      required.length
    );
    supportedPrecision = rateMetric(
      observedFacts.filter((factId) => supported.has(factId)).length,
      observedFacts.length
    );
    staleConflictLeakage = rateMetric(
      leakageControls.filter(({ fact_id: factId }) => observedSet.has(factId)).length,
      leakageControls.length
    );
    provenanceUncertaintyFidelity = rateMetric(
      oracleCase.qualification_labels.filter(({ marker }) => packet.text.includes(marker)).length,
      oracleCase.qualification_labels.length
    );
    unrelatedInclusionCount = oracleCase.prohibitions.filter(
      ({ fact_id: factId, reason }) => reason === "UNRELATED" && observedSet.has(factId)
    ).length;
  }

  const pathTerminal = observation.terminal === "UNKNOWN"
    ? emptyStatusMetric("UNKNOWN")
    : rateMetric(
      ["COMPLETED", "SAFE_FALLBACK"].includes(observation.terminal) ? 1 : 0,
      1
    );
  let safeFallback;
  if (!oracleCase.fallback_expected) safeFallback = rateMetric(0, 0);
  else if (observation.fallback_preserved === null) safeFallback = emptyStatusMetric("UNKNOWN");
  else safeFallback = rateMetric(observation.fallback_preserved ? 1 : 0, 1);

  return {
    host_id: observation.host_id,
    arm_id: observation.arm_id,
    case_id: observation.case_id,
    primary_category: observation.primary_category,
    authorization_lane: observation.authorization_lane,
    evidence_lane: observation.evidence_lane,
    observed_boundary: observation.observed_boundary,
    packet_status: packet.status,
    required_fact_recall: requiredFactRecall,
    supported_precision: supportedPrecision,
    stale_conflict_leakage: staleConflictLeakage,
    provenance_uncertainty_fidelity: provenanceUncertaintyFidelity,
    declared_context_units: unitsMetric(packet),
    path_terminal_rate: pathTerminal,
    safe_fallback_rate: safeFallback,
    unrelated_inclusion_count: unrelatedInclusionCount,
  };
}

function statusCounts(values) {
  const counts = Object.fromEntries(CELL_STATUSES.map((status) => [status, 0]));
  values.forEach((status) => {
    assertEnum(status, CELL_STATUSES, "metric status");
    counts[status] += 1;
  });
  return counts;
}

function aggregateRateMetrics(metrics) {
  const evaluable = metrics.filter(({ status }) => status === "EVALUABLE");
  const numerator = evaluable.reduce((sum, value) => sum + value.numerator, 0);
  const denominator = evaluable.reduce((sum, value) => sum + value.denominator, 0);
  const counts = statusCounts(metrics.map(({ status }) => status));
  let status = "NOT_EVALUABLE";
  if (denominator > 0) status = "EVALUABLE";
  else if (counts.INPUT_UNOBSERVABLE > 0) status = "INPUT_UNOBSERVABLE";
  else if (counts.UNKNOWN > 0) status = "UNKNOWN";
  else if (counts.UNSUPPORTED > 0) status = "UNSUPPORTED";
  return {
    status,
    numerator: denominator > 0 ? numerator : status === "NOT_EVALUABLE" ? 0 : null,
    denominator: denominator > 0 ? denominator : status === "NOT_EVALUABLE" ? 0 : null,
    rate: denominator > 0 ? round(numerator / denominator) : null,
    status_counts: counts,
  };
}

function aggregateUnitMetrics(metrics) {
  const evaluable = metrics.filter(({ status }) => status === "EVALUABLE");
  const counts = statusCounts(metrics.map(({ status }) => status));
  return {
    status: evaluable.length > 0 ? "EVALUABLE" : aggregateRateMetrics(
      metrics.map(({ status }) => emptyStatusMetric(status))
    ).status,
    value: evaluable.length > 0 ? evaluable.reduce((sum, value) => sum + value.value, 0) : null,
    evidence_quality: evaluable.length > 0 ? "ESTIMATED" : null,
    estimator_id: TOKENIZER_ID,
    status_counts: counts,
  };
}

function aggregateCells(cells) {
  return ARMS.map((armId) => {
    const selected = cells.filter(({ arm_id: cellArm }) => cellArm === armId);
    return {
      host_id: "REFERENCE_FIXTURE_NOT_A_HOST",
      arm_id: armId,
      authorization_lane: "PUBLIC_SYNTHETIC_FIXTURE",
      evidence_lane: "VALIDATOR_CONFORMANCE_ONLY",
      observed_boundary: "CONTEXT_PACKET_BEFORE_MODEL",
      attempted_case_count: selected.length,
      required_fact_recall: aggregateRateMetrics(selected.map(({ required_fact_recall: value }) => value)),
      supported_precision: aggregateRateMetrics(selected.map(({ supported_precision: value }) => value)),
      stale_conflict_leakage: aggregateRateMetrics(selected.map(({ stale_conflict_leakage: value }) => value)),
      provenance_uncertainty_fidelity: aggregateRateMetrics(
        selected.map(({ provenance_uncertainty_fidelity: value }) => value)
      ),
      declared_context_units: aggregateUnitMetrics(selected.map(({ declared_context_units: value }) => value)),
      path_terminal_rate: aggregateRateMetrics(selected.map(({ path_terminal_rate: value }) => value)),
      safe_fallback_rate: aggregateRateMetrics(selected.map(({ safe_fallback_rate: value }) => value)),
      unrelated_inclusion_count: selected.reduce(
        (sum, { unrelated_inclusion_count: value }) => sum + (value === null ? 0 : value),
        0
      ),
      packet_status_counts: statusCounts(selected.map(({ packet_status: status }) => status)),
    };
  });
}

function compareUnits(candidate, baseline) {
  if (candidate.status !== "EVALUABLE") {
    return {
      status: candidate.status,
      baseline_units: null,
      candidate_units: null,
      unit_delta: null,
      candidate_to_baseline_ratio: null,
    };
  }
  if (baseline.status !== "EVALUABLE") {
    return {
      status: baseline.status,
      baseline_units: null,
      candidate_units: null,
      unit_delta: null,
      candidate_to_baseline_ratio: null,
    };
  }
  if (baseline.value === 0) {
    return {
      status: "NOT_EVALUABLE",
      baseline_units: 0,
      candidate_units: candidate.value,
      unit_delta: candidate.value,
      candidate_to_baseline_ratio: null,
    };
  }
  return {
    status: "EVALUABLE",
    baseline_units: baseline.value,
    candidate_units: candidate.value,
    unit_delta: candidate.value - baseline.value,
    candidate_to_baseline_ratio: round(candidate.value / baseline.value),
  };
}

function contextUnitComparisons(cells) {
  return CASE_IDS.map((caseId) => {
    const byArm = new Map(cells.filter((cell) => cell.case_id === caseId).map((cell) => [cell.arm_id, cell]));
    const d0 = byArm.get(ARMS[0]).declared_context_units;
    const d1 = byArm.get(ARMS[1]).declared_context_units;
    const d2 = byArm.get(ARMS[2]).declared_context_units;
    return {
      case_id: caseId,
      host_id: "REFERENCE_FIXTURE_NOT_A_HOST",
      evidence_quality: "ESTIMATED",
      estimator_id: TOKENIZER_ID,
      observed_boundary: "CONTEXT_PACKET_BEFORE_MODEL",
      d2_vs_d0: compareUnits(d2, d0),
      d2_vs_d1: compareUnits(d2, d1),
    };
  });
}

function metricStatusCounts(cells, invalidControlCount) {
  const fields = [
    "required_fact_recall",
    "supported_precision",
    "stale_conflict_leakage",
    "provenance_uncertainty_fidelity",
    "declared_context_units",
    "path_terminal_rate",
    "safe_fallback_rate",
  ];
  const statuses = cells.flatMap((cell) => fields.map((field) => cell[field].status));
  statuses.push(...Array.from({ length: invalidControlCount }, () => "INVALID_RUN"));
  return statusCounts(statuses);
}

function evaluatePositive(fixtures, descriptors, invalidReproductions) {
  const corpusById = new Map(descriptors.corpus.value.cases.map((item) => [item.case_id, item]));
  const oracleById = new Map(descriptors.oracle.value.cases.map((item) => [item.case_id, item]));
  const cells = fixtures.positive_control.observations.map((observation) =>
    evaluateCell(observation, corpusById.get(observation.case_id), oracleById.get(observation.case_id))
  );
  return {
    schema_version: "rc-phase-one-normalized-result/1.0.0",
    claim_ceiling: CLAIM_CEILING,
    run_kind: "VALIDATOR_CONFORMANCE_ONLY",
    manifest_run_id: fixtures.positive_control.manifest.run_id,
    host_id: "REFERENCE_FIXTURE_NOT_A_HOST",
    corpus_id: CORPUS_ID,
    corpus_file_sha256: descriptors.corpus.file_sha256,
    renderer_id: RENDERER_ID,
    tokenizer_id: TOKENIZER_ID,
    context_units_evidence_quality: "ESTIMATED",
    cells,
    aggregates: aggregateCells(cells),
    context_unit_comparisons: contextUnitComparisons(cells),
    metric_status_counts: metricStatusCounts(cells, invalidReproductions.length),
    invalid_controls: invalidReproductions,
  };
}

function runnerDescriptor() {
  const path = fileURLToPath(import.meta.url);
  const { bytes, text } = readUtf8File(path);
  assert(text.endsWith("\n"), "runner source must end in LF");
  assert(!/from\s+["'](?:node:)?(?:http|https|net|tls|dns|child_process|cluster|worker_threads)/u.test(text),
    "runner imports a forbidden network/subprocess capability");
  return {
    path,
    relative_path: relative(REPOSITORY_ROOT, path),
    bytes,
    file_sha256: sha256Bytes(bytes),
  };
}

function deriveFreeze(descriptors) {
  const runner = runnerDescriptor();
  const files = [
    {
      path: descriptors.corpus.relative_path,
      role: "CORPUS",
      file_sha256: descriptors.corpus.file_sha256,
      value_sha256_or_NOT_APPLICABLE: descriptors.corpus.value_sha256,
    },
    {
      path: descriptors.oracle.relative_path,
      role: "EVALUATOR_CONTROL_ORACLE",
      file_sha256: descriptors.oracle.file_sha256,
      value_sha256_or_NOT_APPLICABLE: descriptors.oracle.value_sha256,
    },
    {
      path: descriptors.renderer.relative_path,
      role: "RENDERER_PROFILE",
      file_sha256: descriptors.renderer.file_sha256,
      value_sha256_or_NOT_APPLICABLE: descriptors.renderer.value_sha256,
    },
    {
      path: descriptors.manifest.relative_path,
      role: "RUN_MANIFEST_CONTROLS",
      file_sha256: descriptors.manifest.file_sha256,
      value_sha256_or_NOT_APPLICABLE: descriptors.manifest.value_sha256,
    },
    {
      path: runner.relative_path,
      role: "OFFLINE_RUNNER",
      file_sha256: runner.file_sha256,
      value_sha256_or_NOT_APPLICABLE: "NOT_APPLICABLE",
    },
  ].sort((left, right) => asciiCompare(left.path, right.path));
  const bundlePreimage = files.map(({ path, file_sha256: sha256 }) => ({ path, sha256 }));
  return {
    schema_version: "rc-phase-one-freeze/1.0.0",
    core_baseline: CORE_BASELINE,
    fairness_contract_git_blob: FAIRNESS_BLOB,
    canonicalization_id: CANONICALIZATION_ID,
    digest_algorithm: "SHA-256",
    bundle_preimage_id: BUNDLE_PREIMAGE_ID,
    renderer_id: RENDERER_ID,
    tokenizer_id: TOKENIZER_ID,
    files,
    fixture_bundle_sha256: sha256Text(canonicalize(bundlePreimage)),
  };
}

function validateFreeze(freeze, descriptors) {
  assertKeys(freeze, [
    "schema_version",
    "core_baseline",
    "fairness_contract_git_blob",
    "canonicalization_id",
    "digest_algorithm",
    "bundle_preimage_id",
    "renderer_id",
    "tokenizer_id",
    "files",
    "fixture_bundle_sha256",
  ], "freeze");
  const expected = deriveFreeze(descriptors);
  assert(canonicalize(freeze) === canonicalize(expected), "freeze does not bind exact file/value/bundle digests");
}

function loadBaseControls() {
  const corpus = loadCanonicalJson("corpus.json");
  validateCorpus(corpus.value);
  const oracle = loadCanonicalJson("oracle.json");
  validateOracle(oracle.value, corpus.value);
  const renderer = loadCanonicalJson("renderer.json");
  validateRenderer(renderer.value, corpus.value);
  const manifest = loadCanonicalJson("run-manifest-fixtures.json");
  const descriptors = { corpus, oracle, renderer, manifest };
  const invalidReproductions = validateManifestFixtures(manifest.value, descriptors);
  return { descriptors, invalidReproductions };
}

function loadFrozenControls() {
  const base = loadBaseControls();
  const freeze = loadCanonicalJson("freeze.json");
  validateFreeze(freeze.value, base.descriptors);
  return { ...base, freeze };
}

function replay() {
  const { descriptors, invalidReproductions, freeze } = loadFrozenControls();
  const firstDirectory = mkdtempSync(join(tmpdir(), "rc-phase-one-replay-a-"));
  const secondDirectory = mkdtempSync(join(tmpdir(), "rc-phase-one-replay-b-"));
  try {
    const firstResult = evaluatePositive(descriptors.manifest.value, descriptors, invalidReproductions);
    const secondResult = evaluatePositive(descriptors.manifest.value, descriptors, invalidReproductions);
    const firstBytes = Buffer.from(`${canonicalize(firstResult)}\n`, "utf8");
    const secondBytes = Buffer.from(`${canonicalize(secondResult)}\n`, "utf8");
    const firstPath = join(firstDirectory, "normalized-result.json");
    const secondPath = join(secondDirectory, "normalized-result.json");
    writeFileSync(firstPath, firstBytes, { flag: "wx" });
    writeFileSync(secondPath, secondBytes, { flag: "wx" });
    const firstReadback = readFileSync(firstPath);
    const secondReadback = readFileSync(secondPath);
    assert(firstReadback.equals(secondReadback), "fresh-directory normalized replay bytes differ");
    const resultValueSha256 = sha256Text(canonicalize(firstResult));
    const output = {
      schema_version: "rc-phase-one-replay-receipt/1.0.0",
      replay_status: "BYTE_IDENTICAL",
      normalized_result: firstResult,
      normalized_result_value_sha256: resultValueSha256,
      normalized_result_file_sha256: sha256Bytes(firstReadback),
      freeze_file_sha256: freeze.file_sha256,
      fixture_bundle_sha256: freeze.value.fixture_bundle_sha256,
    };
    return `${canonicalize(output)}\n`;
  } finally {
    rmSync(firstDirectory, { recursive: true, force: true });
    rmSync(secondDirectory, { recursive: true, force: true });
  }
}

function validationReceipt() {
  const { descriptors, invalidReproductions, freeze } = loadFrozenControls();
  return {
    schema_version: "rc-phase-one-validation-receipt/1.0.0",
    corpus_id: CORPUS_ID,
    case_count: descriptors.corpus.value.cases.length,
    invalid_control_count: invalidReproductions.length,
    renderer_id: RENDERER_ID,
    tokenizer_id: TOKENIZER_ID,
    freeze_file_sha256: freeze.file_sha256,
    fixture_bundle_sha256: freeze.value.fixture_bundle_sha256,
  };
}

function print(value) {
  process.stdout.write(`${canonicalize(value)}\n`);
}

function runCommand(args) {
  const command = args[0] ?? "replay";
  if (command === "canonicalize-draft") {
    assert(args.length === 2, "canonicalize-draft requires one fixture basename");
    const allowed = ["corpus.json", "oracle.json", "renderer.json", "run-manifest-fixtures.json", "freeze.json"];
    assertEnum(args[1], allowed, "canonicalize-draft basename");
    print(loadDraftJson(args[1]));
    return;
  }
  if (command === "derive-renderer") {
    assert(args.length === 1, "derive-renderer accepts no extra arguments");
    const corpus = loadCanonicalJson("corpus.json");
    print(deriveRenderer(corpus.value));
    return;
  }
  if (command === "materialize-manifest") {
    assert(args.length === 1, "materialize-manifest accepts no extra arguments");
    const corpus = loadCanonicalJson("corpus.json");
    validateCorpus(corpus.value);
    const oracle = loadCanonicalJson("oracle.json");
    validateOracle(oracle.value, corpus.value);
    const renderer = loadCanonicalJson("renderer.json");
    validateRenderer(renderer.value, corpus.value);
    const manifest = loadCanonicalJson("run-manifest-fixtures.json");
    const materialized = materializeManifestFixtures(manifest.value, corpus, oracle, renderer);
    validateManifestFixtures(materialized, { corpus, oracle, renderer, manifest });
    print(materialized);
    return;
  }
  if (command === "freeze") {
    assert(args.length === 1, "freeze accepts no extra arguments");
    const { descriptors } = loadBaseControls();
    print(deriveFreeze(descriptors));
    return;
  }
  if (command === "validate") {
    assert(args.length === 1, "validate accepts no extra arguments");
    print(validationReceipt());
    return;
  }
  if (command === "replay") {
    assert(args.length === 1, "replay accepts no extra arguments");
    process.stdout.write(replay());
    return;
  }
  fail("INVALID_CONTROL", `unknown command ${command}`);
}

function isMainModule() {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  try {
    return realpathSync(resolve(invoked)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export {
  FixtureError,
  canonicalize,
  computeRunId,
  deriveRenderer,
  estimateTokens,
  parseStrictJson,
  replay,
  runCommand,
};

if (isMainModule()) {
  try {
    runCommand(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof FixtureError ? error.code : "RUNTIME_FAILURE";
    process.stderr.write(`${canonicalize({ error: { code } })}\n`);
    process.exitCode = 1;
  }
}

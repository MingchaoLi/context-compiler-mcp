# PH1-EVAL-FIXTURE-01 — Fresh independent Evaluation Module re-QA

Verdict: `PASS`

- Reviewed source candidate: `04acb738d70bd1a7be858e0bf418e8e2af0972b6`
- Exact source parent: `e877944d45457ca0fd8b3ae2020329285d8e892d`
- Reviewed handoff HEAD / required QA parent: `34cef69e74f031968f9cebd5712dc683771fc717`

This verdict accepts only the bounded public synthetic fixture module at the claim ceiling
`PUBLIC_SYNTHETIC_FIXTURE_PACKET_INCLUSION`. It is not Governance Submission QA, does not authorize a measured Host
run, and does not establish natural-language answer correctness, truthfulness, final-input observability, provider
tokens, billing savings, a scalar winner, roster completion, deployment, or `ACTIVE` behavior.

## Independent authority and lineage check

- The review was cold-started from repository files and Git history. The current work order, handoff, module contract,
  accepted Target, fairness contract, `REQ-RC-005/010/011/012 rev-001`, and the routed Architecture/Interface artifacts
  were read before the verdict.
- Product authority was independently fixed at
  `RippleContext-governance@7129e453fbb08648250bfbd15da93596c635ddbe`. The Target manifest blob/file receipts are
  `7f2e350b0947e49f295e06f63f4a61d4ab56ab52` /
  `eecc6f6a1e6077a34751c36fc04cf810ac1f4db5c183340d6bc8c69e40a3d9bd`; the accepted fairness blob/file receipts are
  `243636ae70d5e4f0b90c9f77eeea0b48def2eb25` /
  `07a79307c7ae452132b12ed98b13b45d6502c4126f1c25cf32c2560ab14e297b`.
- `04acb738` is a direct child of `e877944d`; its diff contains exactly the offline runner, focused test, and
  runner-dependent freeze receipt. `34cef69e` is a direct child of `04acb738`; its diff contains exactly the work-order
  append-only receipt and Builder handoff. All seven fixture/test paths are ordinary Git files. The pre-QA worktree
  was clean.
- The four public control bytes (`corpus.json`, `oracle.json`, `renderer.json`, and
  `run-manifest-fixtures.json`) are byte-identical to `e877944d`. Core `src/**`, package, lock, config, schema, and
  other evaluation assets have no candidate drift. The four routed public baseline source SHA-256 values remain
  `1c8585fb3c20f2fac423afd6c28b2065dd23b5917df3aa41181c5efe5f56e2d9`,
  `e20d2f76c110656db251141bbce50ce78fcc6437c6c2769bbf173fc60e3e3b4a`,
  `2d711e2e454703b5563e4856fb8be0330a42936fd440c983707e1816f3e8eec0`, and
  `70394a0a44974d94e1c1a767c387ffadc4a00db8375177d1dcd1b1867445c2fc` exactly as frozen by the work order.

## Independent fixture and digest reconstruction

The four public JSON controls and `freeze.json` independently reproduced as canonical JCS value bytes plus one LF.
Exact receipts are:

| Artifact | File SHA-256 | Value SHA-256 |
| --- | --- | --- |
| corpus | `db8e13339f57434b06f83018886edd32e7227c70c80b9eaed23b63f647d46636` | `003f36c13653f27b7f036cd97100d37b16d3dd4b9eb81e52945c79d5235daaad` |
| oracle | `efd8f9864e7625293a8aae416a10b6e352b98958468a74e342e03fff88d2f7ce` | `0682e11d36800aaac049d900d696f2666448b738ac187c47c09b1693ae297a18` |
| renderer | `d0b861f404e473557847a7a7ea25457e8825c6a31d83cc2e1eecb7c2809f87f7` | `4d61bd32d95b525832862bc967019ac422cf0db56ace3bf78ca963f59faf2e1f` |
| manifest controls | `77bdaa3e8c565efad3f7ef12197f0aa39a3f5e633facb1e49f9ec5325fa6b866` | `c76810e5e6cce4f633924e462acca3dd9a634e19d0b0d9245536523efb91d529` |
| runner | `2386cca0e93d03c92d9cbf833b74a9302b16ae4a4c2a2a8d0a0bfbff6103d12c` | `NOT_APPLICABLE` |
| freeze | `9d5edbbee19ebf4e76fbbdeeb0a0a538baefe7752e4f602d529777766bb743a4` | `16bdd5fac594beaa5de1742ec423e9169ca7b6b384bf7558a676cd19cca0253d` |

- The ASCII-path-sorted bundle independently reproduced as
  `65ff3965ee54f7d71b4c5408f172e2100e870db4af115ac415ea599e31e5be26`.
- Compared with the preceding candidate, only the runner file receipt and derived bundle changed inside
  `freeze.json`; every other freeze field/entry is equal. The runner's `freeze` command reproduced the committed
  `freeze.json` bytes exactly.
- The corpus is exactly six ASCII-ordered `ALL_CASES`, with one case per frozen category, 11 sequential fact ids,
  11 sequential source ids, and three sequential qualification ids. The oracle classifies every visible fact exactly
  once; C05 D0 history is exactly 39,332 UTF-8 bytes. Public-control credential, URL, local-path, database, and private
  key scans found no unauthorized content.

## Closure of the current RETURN family

Returned family: `NON_DELIMITER_SAFE_FACT_ID_SUBSTRING_FALSE_POSITIVE`.

An independently built temporary coordinated copy rewrote the observation, regenerated the canonical manifest
fixture bytes, recomputed the complete manifest run id, and regenerated freeze-file and bundle receipts before every
replay. It did not call the focused test helper as its oracle.

- `[FX-F0001]` remained an exact assertion: required-fact recall `1/1`, supported precision `1/1`.
- Each of `xFX-F0001y`, `xFX-F0001`, `FX-F0001y`, `AFX-F0001`, `FX-F0001Z`, `1FX-F0001`, `FX-F00010`,
  `-FX-F0001`, and `FX-F0001-` produced required-fact recall `0/1` and supported precision
  `NOT_EVALUABLE (0/0)`. Thus two-sided and one-sided lowercase, ASCII uppercase, digit, and hyphen adjacency are
  continuations rather than safe delimiters.
- The run id was independently recomputed for every observation copy and remained
  `RUN-SHA256-5b061c46627e651da35d788decc11cfe5500dc2440451021db67f9367468f947`, because the frozen run manifest itself was
  unchanged. Each changed public manifest-fixture file received its own recomputed freeze/bundle receipts.

The minimal failure family is mechanically closed: the scorer recognizes only exact uppercase `FX-Fdddd` at the
contract's ASCII delimiter-safe boundaries.

## Regression of earlier RETURN families

The three earlier RETURNs remain visible; this PASS does not erase or rewrite them.

1. `EVALUATOR_CONTROL_QUALIFICATION_MARKER_LEAKAGE_NOT_REJECTED`: the original candidate failed to derive the full
   oracle marker registry and scan every cutoff-visible input surface. The append-only runner fix now derives all
   three exact markers (`[[SOURCE_FX-S0006]]`, `[[AUTHORITY_OR_UNCERTAIN]]`, and `[[ABSTAIN_OR_QUALIFY]]`) from the
   validated oracle. Independent coordinated copies regenerated corpus, renderer, manifest/run id, freeze, and
   bundle receipts. A benign rewrite passed; all three markers across `sources`, `current_input`, and
   `fallback_scenario` failed closed 9/9 with `INVALID_ORACLE_EXPOSURE`.
2. `FORBIDDEN_IMPLEMENTATION_NETWORK_ATTEMPT_VIOLATES_FROZEN_NO_NETWORK_BOUNDARY`: an earlier Builder invocation of
   `npx` attempted the npm registry and failed DNS. The event remains a historical process RETURN even though nothing
   downloaded or installed. The later append-only offline reconstruction retained the same fixture tree and used the
   already-present local dependency tree. This fresh QA likewise used no `npx`, network attempt, install, model, or
   provider.
3. `NON_DELIMITER_SAFE_FACT_ID_SUBSTRING_FALSE_POSITIVE`: the prior uppercase-only delimiter guard admitted lowercase
   adjacency. Candidate `04acb738` expands both guards to ASCII letters, digits, and hyphen; the independent positive
   and negative coordinated-copy matrix above closes the family.

## Replay, missingness, and result-envelope checks

- `validate` returned six cases and all 14 exact invalid controls.
- Two external invocations from different fresh working directories were byte-identical. Replay receipt file SHA-256
  is `f906bcefd204745277e70925e65088a5b6f4dfaca1691fb1277f1d4bf91a9695`; normalized result file/value SHA-256 are
  `bd46477669f11f07bdc588b1cdbcea5f09da9a20d3b6b01f8c93781ab19e75ff` /
  `30c2f54f61ba5071b0d9a1c465ca7eddb54657f09d090055f6e101b83032c893`.
- The normalized result has exactly 18 cells, three arm aggregates, six same-case unit comparisons, and 14 separate
  `INVALID_RUN` controls. Genuine C04 zero denominator remains `NOT_EVALUABLE (0/0)`; `UNKNOWN`, `UNSUPPORTED`, and
  `INPUT_UNOBSERVABLE` remain distinct. Recursive review found no `score`, `rank`, `winner`, `passed`, or `weights`
  authority.
- The official positive run id and normalized result hashes are unchanged by the delimiter fix.

## Commands, environment, and flaky classification

Environment: Darwin `25.5.0` arm64; Node `v25.6.1`; npm `11.9.0`; repository-local pre-existing dependencies only;
`npm_config_offline=true` for every npm/Vitest command.

- Focused fixture: 8/8 passed.
- Full suite: 38 files passed / 1 skipped; 595 tests passed / 1 skipped.
- `npm run build`: passed.
- Runner `validate`, independent coordinated-copy boundary matrix, coordinated marker 3 x 3 matrix, freeze-byte
  equality, two fresh-cwd replay/diff, independent canonical/digest reconstruction, exact path allowlists,
  ordinary-file checks, no-drift checks, `git diff --check`, and clean pre-QA status: passed.

Flaky classification: `NO_FLAKE_OBSERVED_IN_THIS_QA`. The full suite passed on its first and only QA run; no retry was
used. Repeated Node experimental-SQLite warnings were environment noise and did not alter any verdict. The single
skipped test is the repository's intentional official-result generation skip, not a candidate failure. Earlier
Builder-recorded ContextSnapshot cleanup/lock races and the historical `npx`/DNS process violation were not used as
passing evidence and were not reproduced in this QA.

## Final boundary

Module QA status is `PASS`, limited to the fixed candidate and receipts above. Governance Submission QA remains
unmaterialized and unauthorized. No Host roster, Host/version/package artifact, measured run, model/provider,
private/real history, deployment, `ACTIVE`, billing conversion, or scalar decision is accepted or authorized here.

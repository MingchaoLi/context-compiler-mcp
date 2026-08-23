#!/usr/bin/env node

import { resolve } from "node:path";
import { DEFAULT_REPOSITORY_ROOT, runSt01Conformance } from "./replay.js";

const repositoryRoot = resolve(process.argv[2] ?? DEFAULT_REPOSITORY_ROOT);
const report = await runSt01Conformance(repositoryRoot);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

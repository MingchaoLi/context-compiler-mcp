#!/usr/bin/env node

import { resolve } from "node:path";
import { DEFAULT_REPOSITORY_ROOT, buildNextPacketFromCapture } from "./runtime.js";

const repositoryRoot = resolve(process.argv[2] ?? DEFAULT_REPOSITORY_ROOT);
const captureRoot = process.argv[3] === undefined ? undefined : resolve(process.argv[3]);
const result = await buildNextPacketFromCapture(
  repositoryRoot,
  captureRoot,
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

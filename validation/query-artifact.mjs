import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CoreReadQuery } from '../dist/query.js'

const directory = mkdtempSync(join(tmpdir(), 'context-compiler-query-artifact-'))
const query = new CoreReadQuery(join(directory, 'core.db'))

try {
  const result = query.readCaseFormation({
    contract: 'ripplecontext-case-formation-read/v1',
    schema_version: 1,
    session_scope: {
      contract_version: 'ripplecontext-session-scope/v1',
      write_session: { namespace: 'authority', session_id: 'artifact-leaf' },
      read_scope: [{
        session: { namespace: 'authority', session_id: 'artifact-leaf' },
        frontier: { kind: 'CURRENT' },
        precedence: 0,
      }],
    },
  })
  assert.deepEqual(result.cases, [])
  assert.deepEqual(result.raw_only_finalizations, [])
  assert.equal('commitCaseConclusion' in query, false)
  assert.equal('abstainCaseFormation' in query, false)
  assert.equal('call' in query, false)
} finally {
  query.close()
  rmSync(directory, { recursive: true, force: true })
}

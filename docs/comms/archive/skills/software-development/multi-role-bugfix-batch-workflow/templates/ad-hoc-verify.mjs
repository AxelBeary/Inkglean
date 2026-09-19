/**
 * hermes-verify-<batch>.mjs — ad-hoc verification for a fix batch.
 * Copy to C:\Users\<user>\AppData\Local\Temp\hermes-verify-<batch>.mjs, run with
 * `node <path>`, show the N/N output as evidence, then Remove-Item it.
 *
 * Static source assertions: fast, no server boot, confirms each fix's code
 * structure is actually present. This is AD-HOC verification, NOT suite green —
 * pair it with `npx vitest run` + `npx eslint .` (server and web).
 *
 * WINDOWS ESM PITFALL: dynamic import of an absolute Windows path fails with
 * ERR_UNSUPPORTED_ESM_URL_SCHEME (drive letter parsed as protocol). Fix:
 *   import { pathToFileURL } from 'node:url'
 *   const mod = await import(pathToFileURL(absPath).href)
 * Static readFileSync of absolute paths needs no such wrapper.
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const BASE = 'D:/Hermes Agent CN Desktop/workspace/<project>-bugfix'
const read = (p) => readFileSync(`${BASE}/${p}`, 'utf8')

// ─── Item X: <one-line description> ───
const src = read('server/src/features/<file>.js')
assert.ok(src.includes('<expected code marker>'), 'X: <what must be true>')
// Scope assertions to the relevant block when a token legitimately appears elsewhere:
//   const block = src.slice(src.indexOf('<!-- start marker'), src.indexOf('<!-- end marker'))
//   assert.ok(!block.includes('<forbidden>'), 'X: ...')
console.log('✅ X: <description> — 通过')

// ... one block per fix item ...

console.log('\n🎉 <Batch> ad-hoc 验证：N/N 全部通过')

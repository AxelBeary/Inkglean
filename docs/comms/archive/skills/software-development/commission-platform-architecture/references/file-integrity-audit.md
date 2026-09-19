# File-Integrity Audit (post-restore)

**When to run:** after ANY database restore, and any time images show "加载失败"
despite the DB looking healthy. A restored DB brings back the *records* (file
paths) but says nothing about whether the *files* still exist on disk. In the
2026-07-30 incident the orphan-GC deleted the real image files while the DB was
transiently empty, so the restore produced a DB full of paths pointing at
deleted files.

**The rule:** records restored ≠ files present. Never declare a recovery
complete until you have walked every file-path column and confirmed each file
exists with a non-trivial size.

## Audit script

Drop this into `/app/server/` (where `better-sqlite3` resolves) as a `.cjs`
file and run `node check-files.cjs`. Adjust `UPLOAD` if the mount differs.

```js
const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const db = new Database('/app/data/commission.db', { readonly: true })
const UPLOAD = '/app/uploads'

function check(label, rows, field) {
  console.log(`\n=== ${label} ===`)
  for (const r of rows) {
    const p = r[field]
    if (!p) continue
    const full = path.join(UPLOAD, p)
    const exists = fs.existsSync(full)
    const size = exists ? fs.statSync(full).size : 0
    // size <= ~20 bytes is a test artifact, not a real image — flag it too
    const tag = !exists ? 'MISSING' : (size < 100 ? 'TINY(test-junk?)' : 'OK')
    console.log(`  [${tag}] id=${r.id} ${p} (${size} bytes)`)
  }
}

check('artworks', db.prepare('SELECT id, image_path FROM artworks').all(), 'image_path')
check('tier examples', db.prepare('SELECT id, example_image FROM price_tiers WHERE example_image IS NOT NULL').all(), 'example_image')
check('order references', db.prepare('SELECT id, file_path FROM order_references').all(), 'file_path')
check('deliverables', db.prepare('SELECT id, file_path FROM deliverables').all(), 'file_path')
check('note images', db.prepare('SELECT id, image_path FROM order_notes WHERE image_path IS NOT NULL').all(), 'image_path')
check('avatars', db.prepare('SELECT id, avatar FROM artists WHERE avatar IS NOT NULL').all(), 'avatar')
db.close()
```

## Reading the output

- `MISSING` → the file is gone. If it's an artwork/tier-example the artist must
  re-upload; there is no recovery (uploads/ is not backed up by the migration
  snapshots — only the DB is).
- `TINY(test-junk?)` → a few-byte file left behind by a test that wrote to the
  real uploads dir. Confirms the test-isolation bug; clean these up.
- All `OK` → recovery is genuinely complete.

## Why files vanish but references/ survives

The orphan-GC deletes files it can't match to a DB record. During a wipe the
DB has no records, so EVERYTHING looks orphaned — but the GC may only process
certain directories per run, or run on a timer, so some dirs (e.g.
`references/`) can survive while `images/` is cleared. Don't assume "some files
exist ⇒ all exist." Audit every column.

## Prevention cross-links

- Guard the GC against an empty DB (see the "GC orphan-cleanup COMPOUNDS a DB
  wipe" pitfall in SKILL.md) — this is what stops the file loss in the first
  place.
- Fix test isolation so the production DB/uploads are never written by tests
  (the root cause of the wipe that triggers the GC).

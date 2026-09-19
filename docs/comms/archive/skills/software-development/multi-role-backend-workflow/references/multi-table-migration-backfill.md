# Multi-Table Migration with Old-Data Backfill Pattern

Demonstrated in v0.32 Phase 1 (REQ-023): 5 new tables + per-artist data migration from legacy tables.

## When to use

When a feature replaces an old data model with a new multi-table structure, but old tables must be preserved (orders still reference them via FK). The migration creates new tables AND populates them from old data so the app works immediately post-migration.

## Structure (in MIGRATIONS array)

```js
{
  version: N,
  name: 'descriptive_name',
  up(database) {
    // 1. Backup (五号 audit requirement)
    const dbPath = process.env.DB_PATH || './data/commission.db'
    if (dbPath !== ':memory:' && existsSync(dbPath)) {
      try {
        copyFileSync(dbPath, dbPath + '.bak.vN')  // ⚠️ Use concatenation, NOT template literals
        console.log('📦 迁移 vN: 已备份 ' + dbPath)
      } catch (err) {
        console.warn('⚠️ 迁移 vN: 备份失败（' + err.message + '），继续执行迁移')
      }
    }

    // 2. CREATE TABLE IF NOT EXISTS (idempotent — safe to re-run)
    database.exec(`CREATE TABLE IF NOT EXISTS new_table (...)`)
    database.exec('CREATE INDEX IF NOT EXISTS idx_... ON new_table(...)')

    // 3. Idempotency guard for data migration
    const existing = database.prepare('SELECT COUNT(*) AS c FROM new_table').get().c
    if (existing > 0) return  // Already migrated — skip data backfill

    // 4. Per-entity data migration (loop over parent entities)
    const entities = database.prepare('SELECT id FROM parent_table').all()
    const insertChild = database.prepare('INSERT INTO new_child (...) VALUES (?, ...)')

    for (const entity of entities) {
      // Create default parent row in new structure
      const result = insertParent.run(entity.id, '默认')
      const parentId = Number(result.lastInsertRowid)

      // Map old rows → new rows
      const oldRows = database.prepare(
        'SELECT * FROM old_table WHERE entity_id = ? ORDER BY sort_order ASC'
      ).all(entity.id)
      for (const row of oldRows) {
        insertChild.run(parentId, row.name, row.price, row.sort_order ?? 0)
      }
    }
  }
}
```

## Critical rules

1. **⚠️ NO template literals in backup log lines** — Chinese full-width parentheses `（）` near `${}` break vite/esbuild parser. Use string concatenation: `'text' + var + 'text'`. This applies to ALL migration code, not just this pattern.

2. **Idempotency**: `CREATE TABLE IF NOT EXISTS` for DDL + data guard for backfill. The migration runner wraps each migration in a transaction and records it in `schema_migrations`, so the guard is belt-and-suspenders for partial-failure recovery.

   **🔴 Global guard (`COUNT(*) > 0 → return`) misses entities created AFTER the migration ran.** v36 did exactly this: its guard was "if ANY artist has art_styles, skip ALL". Alice/bob got migrated, then carol was created later (demo-data) and silently never got a default style — production inspection found carol at `art_styles=0` two versions later. **Use a per-entity guard instead**:
   ```js
   const unmigrated = database.prepare(`
     SELECT id FROM artists
     WHERE deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM art_styles WHERE art_styles.artist_id = artists.id)
   `).all()
   for (const artist of unmigrated) { /* migrate just this artist */ }
   ```
   This is idempotent per-entity AND catches late-created entities. **Testability trick**: extract the backfill loop into an exported function (`export function migrateF5OldModelArtists(database)`) that the migration's `up()` calls — tests then invoke it directly (repeat calls prove idempotency) since `initDatabase` already applied the migration in setup.js. Verify with 2–3 consecutive calls asserting no duplicate rows.

3. **Don't delete old tables** — orders/other tables may have FKs pointing at them. The new model coexists until a future migration explicitly drops old tables (after all consumers are migrated).

4. **Prepared statements outside the loop** — create `database.prepare(...)` once, call `.run()` inside the loop. Creating prepared statements per-iteration is wasteful.

5. **`?? 0` for nullable sort_order** — old rows may have NULL sort_order from before the column had a DEFAULT. Coalesce to 0.

6. **Schema string sync** — all new tables MUST also be added to `export const schema` (for fresh installs) and `schemaIndexes` (for new indexes). The migration only runs for upgrades.

7. **cleanDb sync** — add `DELETE FROM` for all new tables in `tests/setup.js`, in FK-dependency order (child before parent):
   ```
   DELETE FROM size_addon_overrides;  -- references style_addons + style_sizes
   DELETE FROM style_addons;          -- references art_styles + addon_templates
   DELETE FROM style_sizes;           -- references art_styles
   DELETE FROM art_styles;            -- references artists
   DELETE FROM addon_templates;       -- references artists
   ```

## Testing the migration

Since `initDatabase()` runs all migrations in setup.js, you can't re-run a specific migration in tests. Instead:

- **TC-MIG-01 (empty DB)**: Verify tables exist via `PRAGMA table_info(table)`, verify zero data rows
- **TC-MIG-02 (simulated old data)**: Manually INSERT old-format data + new-format data, then verify service-layer queries return correct nested results
- **TC-MIG-03 (idempotency)**: Create data via service layer, verify the COUNT guard would skip (existing > 0)

## Field mapping example (v0.32)

Old `price_addons.select_mode` → New `addon_templates.control_type`:
```js
const controlIdMap = { toggle: 'switch', quantity: 'quantity', inquiry: 'radio' }
const controlType = controlIdMap[addon.select_mode] || 'switch'
```

Old `price_addons.price_type` (fixed/percent) → New `pricing_mode`:
```js
const pricingMode = 'fixed'  // percent not supported in v1 — convert to fixed
```

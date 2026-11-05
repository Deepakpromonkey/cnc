# Legacy migration (spec §12)

Moves the old CRM's MySQL dump (`wwnecgawzt.sql`) into the v2 schema. Code: `run.ts` (steps in spec order),
`rules.ts` (deadline parsing, status map, name casing), `exclusions.ts` (test/junk rows — review before go-live).
Output: `report.md` + `out/legacy-images.csv`.

## Dry run (safe, repeatable)

1. Load the dump into any throwaway MySQL 8 (never the old production server), e.g. a scratch instance:
   ```sh
   mysqld --initialize-insecure --datadir=/tmp/legacy-data
   mysqld --datadir=/tmp/legacy-data --socket=/tmp/cnc-legacy.sock --port=3399 &
   mysql -uroot -S /tmp/cnc-legacy.sock -e "CREATE DATABASE legacy"
   mysql -uroot -S /tmp/cnc-legacy.sock legacy < ~/Downloads/wwnecgawzt.sql
   ```
2. `./migration/dry-run.sh` (add `--close-stale-days=30` to close tasks more than 30 days past deadline) — drops and recreates the scratch Postgres DB `cnc_migrate` (override with
   `TARGET_DB=…`; it refuses `cnc_crm`), applies the schema, migrates, writes `migration/report.md`.
   `LEGACY_MYSQL_URL` defaults to the socket above.

## Go-live night (spec §12.8)

1. Set the old CRM read-only; take a fresh dump.
2. Update `exclusions.ts` with Gaurav's confirmed list; re-run the dry run; read the report.
3. Run against the production database once, on an empty schema:
   `MIGRATION_TARGET_URL=<prod url> LEGACY_MYSQL_URL=<scratch mysql> npx tsx migration/run.ts --into-app-db`
4. Send invite/reset emails to every active login (no passwords are migrated).

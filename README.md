# Task Manager Web

Workflow tests cover transitions hợp lệ/không hợp lệ, permission, quantity rounding, report required, manager decisions, reopen reset, concurrent evaluation và rollback khi audit insert fail. Migration 004 đã được áp dụng trên PostgreSQL local. Current verification results are recorded under “Kết quả Phase 5-6”.
set +a
npm run db:migrate
npm run db:health
npm run dev -- --host 127.0.0.1

````

Mo `http://127.0.0.1:5173`. Trang chu hien trang thai database. Endpoint `GET /api/health` tra `200` khi truy van `SELECT 1` thanh cong, hoac `503` voi thong diep tong quat; khong tra connection string hay exception noi bo. Khong goi API nay tu browser de lay chi tiet secret.

## Migration va demo seed

Migration duoc version trong `supabase/migrations/`. Chay `npm run db:migrate` an toan nhieu lan: runner ap dung file SQL theo thu tu, ghi version trong `schema_migrations`, moi migration va ledger record nam trong cung transaction. Khong sua migration da ap dung; them file version moi cho thay doi tiep theo.

Seeder chi tao user demo `demo.admin` neu chua ton tai; hash bang Argon2id va khong doi password cu khi chay lai. Can tu chon password demo rieng, toi thieu 12 ky tu:

```sh
DEMO_ADMIN_PASSWORD='local-only-password-123' npm run db:seed
````

Khong dung password demo cho moi truong production. Phase 1 chua co login UI hay bootstrap production admin; seed nay chi phuc vu local/test.

## Kiem tra

```sh
npm run check
npm run lint
npm test
npm run build
```

Test migration/seed chay tren PostgreSQL tuong thich nhung nhung qua PGlite, khong can Docker hoac Supabase account. Test health bao gom response healthy va response loi khong lo chi tiet. `npm run db:health` la kiem tra ket noi runtime toi PostgreSQL that; can `DATABASE_URL` hop le.

## Giai doan hien tai

Phase 1-6 da co: SvelteKit + TypeScript, server-only PostgreSQL, username/password auth, revocable sessions, account administration, task workflows, dashboard/reports/CSV, login rate limiting, security headers, standalone Node deployment, guarded first-admin bootstrap, va backup/restore runbook.

### Auth va tai khoan (Phase 2)

- Auth rieng tren SvelteKit server; khong su dung Supabase Auth va khong co email gia. Password hash bang Argon2id.
- Session token ngau nhien 256-bit chi nam trong cookie `HttpOnly`, `SameSite=Lax`, `Secure` trong production; database chi luu SHA-256 token digest. Session het han sau 12 gio.
- Hook doc lai session va user tu PostgreSQL moi request; chi chap nhan session neu chua revoke/het han, user dang active va `auth_version` khop. Khi database tam thoi mat ket noi, route bao ve tu choi truy cap nhung cookie khong bi xoa nham.
- POST actions bat buoc `Origin` khop origin cua app. Login loi dung thong diep chung; khong tra password hash cho client.
- ADMIN tao account, reset password, doi role, khoa/mo account. Moi thay doi tai khoan ghi `account_logs` cung transaction; log khong the UPDATE/DELETE. Reset password, doi role, khoa user tang `auth_version` va revoke session.
- Khong the tu khoa minh, khoa ADMIN active cuoi hoac ha cap ADMIN active cuoi. Thao tac thay doi role/trang thai duoc serialize qua `account_admin_guard`.

### Bootstrap ADMIN local

Migration 002 khong tao tai khoan mac dinh. Tao demo admin local bang seed, chi sau khi chay migrations va dat mat khau rieng:

```sh
DEMO_ADMIN_PASSWORD='local-only-password-123' npm run db:seed
```

Sau do dang nhap voi username `demo.admin` va mat khau vua dat. Seed khong doi password neu username da ton tai. Khong dung seed demo tren production; production bootstrap first ADMIN dung `npm run db:bootstrap-admin` va chi chay mot lan (xem Phase 6).

### Ket qua Phase 2

Da chay thanh cong tren workspace:

```text
npm run check   -> 0 errors, 0 warnings
npm run lint    -> all matched files use Prettier code style
npm test        -> phase-specific test count is recorded in the Phase 6 result below
npm run build   -> success
npm audit       -> 0 vulnerabilities
npm run db:migrate -> 202610200004_task_workflow applied / up to date
npm run db:health  -> Database connection: OK
HTTP smoke      -> /login 200; /approvals, /tasks, /tasks/1 redirect anonymous to /login; /api/health 200
```

Workflow tests cover transitions hợp lệ/không hợp lệ, permission, quantity rounding, report required, manager decisions, reopen reset, concurrent evaluation và rollback khi audit insert fail. Migration 004 đã được áp dụng trên PostgreSQL local.

```text
npm run check   -> 0 errors, 0 warnings
npm run lint    -> all matched files use Prettier code style
npm test        -> 14 tests passed (auth/session, role/route, migrations/seed, health)
npm run build   -> success
npm audit       -> 0 vulnerabilities
npm run db:health (with .env exported) -> Database connection: OK
```

Test integration dung PGlite PostgreSQL-compatible embedded engine; khong can Docker. Ket noi PostgreSQL that trong moi truong local da duoc xac nhan qua `npm run db:health`; health HTTP cung tra database `ok` va khong lo secret.

### Cong viec va phan cong (Phase 3)

- Migration `202610200003_tasks` tao `tasks`, `task_members`, `task_logs`; log task co trigger append-only. Luu timestamp `timestamptz` UTC, deadline `date`, quantity `numeric`.
- `/tasks`: tim theo ten/mo ta, loc loai/trang thai, viec lien quan den toi, qua han; `/tasks/[taskId]`: thong tin, thanh vien, nhat ky.
- TEAM tao DRAFT; MANAGER tao DIRECT voi mot nguoi nhan vao IN_PROGRESS; STAFF tao PERSONAL cho chinh minh vao PENDING_APPROVAL.
- Sua task va phan cong duoc enforce trong domain transaction theo role/quan he/status, khong dua vao UI. Bulk TEAM assignment la mot transaction; loi mot dong rollback member va audit log cua ca batch.
- Cac workflow transitions va progress controls duoc bo sung o Phase 4; Phase 3 chi bao gom task metadata va allocation.

### Workflow va audit (Phase 4)

- Migration `202610200004_task_workflow` enforce constraint DB: progress 100 bat buoc co `result_report`; them index cho hang doi duyet/danh gia.
- TEAM: DRAFT/REJECTED -> PENDING_APPROVAL -> IN_PROGRESS -> REPORTED -> PASS/FAIL. Proposer/manager gui; MANAGER approve/reject; lead report khi tat ca member 100% va co result report.
- DIRECT tao IN_PROGRESS va tu REPORTED khi phan viec duy nhat dat 100% co report. PERSONAL tao PENDING_APPROVAL; sau khi duoc approve, tu REPORTED khi hoan tat.
- MANAGER evaluate PASS/FAIL (FAIL can comment) va reopen FAILED (can ly do); reopen xoa evaluation/report hien hanh, audit log giu lich su.
- Task/progress mutation va audit nam trong cung transaction; task row `FOR UPDATE` serialize transition. Quantity progress duoc round nhung khong the la 100 truoc khi done quantity >= quantity.
- `/tasks/[taskId]` co workflow controls theo role/state va `/approvals` co hai tab hang doi. UI chi la presentation; service kiem tra quyen/status server-side.

### Ket qua Phase 3

Da chay thanh cong tren workspace:

```text
npm run check   -> 0 errors, 0 warnings
npm run lint    -> all matched files use Prettier code style
npm test        -> 22 tests passed (auth, task permissions, migrations, bulk rollback, health)
npm run build   -> success
npm audit       -> 0 vulnerabilities
HTTP smoke      -> /login 200; /tasks va /tasks/1 redirect anonymous ve /login; /api/health 200
```

Migration `202610200003_tasks` da duoc ap dung tren PostgreSQL local. Integration tests cover role/type, state-based edit/allocation, single assignee, deadline VN, bulk rollback, duplicate member, audit immutability va list filters. Chua test UI sau dang nhap bang tai khoan that; workflow phe duyet va progress con de o Phase 4.

### Dashboard va bao cao (Phase 5)

- `/`: status counts, tien do trung binh, overdue, due soon 7 ngay, workload, va viec can xu ly; hang doi phe duyet/danh gia chi hien cho MANAGER.
- `/my-work`: phan viec cua toi, TEAM dang chu tri, va task minh de xuat.
- `/reports`: loc theo deadline from/to, nhieu status, type, related user; tong hop PASS/FAIL/pass rate va bang theo nguoi.
- Tai CSV task va per-person report: UTF-8 BOM, CRLF, formula-injection neutralization cho whitespace/control va `= + - @`.

### Security va deploy (Phase 6)

- Build standalone bang `@sveltejs/adapter-node`; chay `npm run build` roi `npm start`. Cau hinh `HOST=0.0.0.0`, `PORT` theo platform; TLS terminate tai reverse proxy/load balancer.
- Production env bat buoc `DATABASE_URL`, `LOGIN_RATE_LIMIT_SECRET` (random toi thieu 32 bytes), `NODE_ENV=production`. Khong reuse DB URL lam limiter secret; khong expose bien nao qua `PUBLIC_*`.
- Login limit dung hai HMAC buckets: username+IP (5 attempts/15 min) va IP aggregate (20 attempts/15 min), block 15 min. Client address phu thuoc `getClientAddress()`; chi tin forwarded headers tu proxy tin cay/allowlisted, khong expose app truc tiep neu proxy IP chua duoc cau hinh.
- Security headers: CSP nonce mode do SvelteKit tao, `nosniff`, `frame-deny`, referrer/permissions policy; HSTS chi production. Cookie Secure bat trong production.
- First production ADMIN bootstrap (one-time, requires migrations and no active admin):

```sh
BOOTSTRAP_ADMIN_USERNAME='admin.name' \
BOOTSTRAP_ADMIN_FULL_NAME='System Administrator' \
BOOTSTRAP_ADMIN_PASSWORD='unique-secret-at-least-12-chars' \
npm run db:bootstrap-admin
```

Bootstrap refuses if an active ADMIN exists, hashes with Argon2id, and writes `account_logs` transactionally. Do not persist bootstrap credentials in deployment config or shell history.

#### PostgreSQL backup va restore

Use private network access and a restricted backup credential; encrypt and store dumps off-host with retention:

```sh
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file="task-manager-$(date +%F).dump"
pg_restore --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "task-manager-YYYY-MM-DD.dump"
npm run db:migrate
npm run db:health
```

Restore into an isolated, empty database first; verify `schema_migrations`, run application tests/smoke tests, then document the recovery point before using restored data. Enable Supabase managed backups/PITR according to the selected plan and periodically test restoring a dump. Never commit dumps or credentials.

### Ket qua Phase 5-6

Da chay tren workspace ngay 2026-10-20:

```text
npm run check    -> 0 errors, 0 warnings
npm run lint     -> all matched files use Prettier code style
npm test         -> 43 tests passed
npm run build    -> success with @sveltejs/adapter-node
npm audit        -> 0 vulnerabilities
npm audit --omit=dev -> 0 vulnerabilities
npm run db:migrate -> 202610200005_login_rate_limits applied / up to date
npm run db:health  -> Database connection: OK
production smoke  -> /login 200; protected routes redirect; /api/health 200
security headers  -> nonce CSP, HSTS, nosniff, frame denial verified
```

Migration 005 da ap dung tren PostgreSQL local. Tests integration dung PGlite; deploy pipeline van phai chay migration va health check tren staging PostgreSQL/Supabase that. `pg_dump`/`pg_restore` khong co san trong workspace, nen commands backup/restore da duoc document nhung chua thuc hien restore drill; can chay rehearsal tren staging truoc go-live.

`pg_dump` va `pg_restore` khong duoc cai trong workspace nay, nen backup/restore command da duoc document nhung chua thuc hien restore drill thuc te. Hay chay restore rehearsal trong staging truoc khi go-live.

## Env

`.env.example` chi chua gia tri placeholder. Tat ca `.env*` bi ignore boi git; chi file mau `.env.example` duoc phep theo doi. `DATABASE_URL` chi duoc doc tu module server `$env/dynamic/private` hoac script CLI server-side.

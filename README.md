# Skyboom Digital Attendance System

Web-based attendance for Skyboom Ghana Limited: staff check in/out from the office (server-verified geofence), administrators manage staff, schedules, corrections, reports and audit logs.

**Stack:** HTML/CSS/vanilla JS - Node.js + Express - PostgreSQL - server-side sessions (HTTP-only cookies) - bcrypt.

## What is implemented (and verified)
`npm test` runs unit tests for lateness, grace period, incomplete records, absence deadline, early departure, geofence and Accra time handling.
`scripts/smoke-test.js` ran 37 end-to-end checks against a real PostgreSQL 16 instance: login/CSRF, forced password change, role enforcement, geofence and accuracy rejection, duplicate check-in, concurrent check-outs (only one succeeds), server-side timestamps, corrections with mandatory reason and audit before/after, deactivation killing sessions, reports, CSV and PDF export. Audit-log immutability was also confirmed (DELETE is blocked by a database trigger).

**Not yet tested - do these before go-live:** a real phone on the real office premises (GPS behaviour and permission prompts), mobile layouts on actual devices, the exception-request approval flow through the browser UI, browser-level UI testing generally, backup/restore, load, and a hosted HTTPS deployment. The UI was written and syntax-checked but not visually reviewed in a browser by me.

## Provisional settings needing management approval
| Setting | Value used | Where to change |
|---|---|---|
| Working days / hours | Mon-Fri, 08:00-17:00 | Admin > Work schedule |
| Late grace period | 15 minutes | Work schedule |
| Absence deadline | **10:00 (my placeholder - not provided)** | Work schedule |
| Early-departure tracking | **Off** until the policy is confirmed | Work schedule |
| Geofence radius / GPS accuracy limit | 100 m proposed / 50 m placeholder | Office location |
| Office coordinates | **Not set. Nobody can check in until an admin enters them** | Office location |
Public holidays and approved leave are **not modelled**: those days will show as absences. Add this once policy is defined.

## Setup
1. Install Node 18+ and PostgreSQL 14+.
2. Create a database and a limited user:
   ```sql
   CREATE USER skyboom_app WITH PASSWORD 'a-strong-password';
   CREATE DATABASE skyboom_attendance OWNER skyboom_app;
   ```
3. `cp .env.example .env` and fill in `DATABASE_URL` and `SESSION_SECRET` (generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
4. `npm install`
5. `npm run migrate` - creates tables and the provisional schedule.
6. Create the first administrator: `INITIAL_ADMIN_PASSWORD='ChooseAStrongOne1' npm run create-admin -- "Full Name" admin@skyboom.com ADMIN001`
7. `npm start`, open http://localhost:3000, log in, change the password, then set the **Office location** and review the **Work schedule**.
Geolocation works on `localhost` and on HTTPS only.

## Environment variables
`DATABASE_URL`, `DATABASE_SSL` (true on most managed hosts), `SESSION_SECRET`, `SESSION_HOURS`, `COOKIE_SECURE` (true when HTTPS), `TRUST_PROXY` (1 behind a platform proxy), `PORT`, `NODE_ENV=production` in production. Never commit `.env`.

## Project structure
```
db/schema.sql            tables, constraints, audit trigger, session table
scripts/                 migrate, create-admin, smoke-test
src/routes/              URL -> controller wiring, role guards, rate limits
src/controllers/         request validation (zod) + response shaping
src/services/            business rules (attendance, staff, config, reports)
src/repositories/        all SQL (parameterised)
src/middleware/          auth, CSRF, validation, errors
src/utils/               pure rules (lateness, absence), geofence, Ghana time
views/ public/           pages, CSS (variables in :root), JS
tests/                   unit tests
```

## Key design decisions
- **Time:** stored as UTC `timestamptz`; the work date and displays use `Africa/Accra`. (Accra is UTC+0 year-round; the admin datetime inputs rely on that.)
- **No duplicates:** `UNIQUE(user_id, work_date)` plus row locks on check-out.
- **History safe:** each attendance row stores a snapshot of the schedule that applied; new schedules cannot start in the past.
- **Incomplete / absent are derived:** a record with no check-out becomes *incomplete* after end time; absences are computed after the absence deadline on working days, so changing rules never leaves stale rows.
- **Location privacy:** only the distance, accuracy and result of a *successful* verification are stored on the attendance row. Failed attempts are not logged and no location history is kept.
- **Exceptions:** staff request, an admin approves with a verified time and a mandatory note; both are audited. Admin-entered/corrected records always require a reason and are tagged `source`.
- **Security:** bcrypt (cost 12), HTTP-only SameSite cookies, CSRF token on all writes, Helmet + strict CSP, rate limits, 5-failure lockout (15 min), role read from the DB on every request, parameterised SQL, password hashes never returned, deactivated users' sessions are deleted.
- "System settings" = Work schedule + Office location pages; "account management" = My account (password change).

## Before going live (not done by this code)
- Get Skyboom's official attendance policy and the surveyed office coordinates.
- Hosting with HTTPS and managed PostgreSQL; set `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`. Give the DB user only SELECT/INSERT/UPDATE/DELETE (no DDL; run migrations with a separate owner account).
- Backups: enable daily automated backups on the host, set a retention period, and **test a restore** (`pg_dump` / `pg_restore`).
- Define a data-retention period and a written outage fallback (e.g. paper sign-in sheet, later entered by an admin via *Add missing record*, which is audited).
- Review obligations under Ghana's Data Protection Act, 2012 (Act 843): register with the Data Protection Commission as needed and tell staff what location data is collected and why.
- Run a controlled pilot with a small group first. GPS can be spoofed, so audit logs and periodic review matter.

## Testing
```
npm test                                   # unit tests (no database needed)
BASE=http://localhost:3000 ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=... node scripts/smoke-test.js   # needs a running server
```
The smoke test creates test data (a test office and schedule): run it only against a throwaway database.

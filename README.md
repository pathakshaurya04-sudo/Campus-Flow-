# CampusFlow Department Management System

A college project with a React/Vite frontend and an Express API backed by Supabase PostgreSQL. It currently provides login, role-aware dashboards, department management, and course listing/creation using the implemented backend routes.

## Stack

- Frontend: React, JavaScript, Vite, React Router, CSS
- Backend: Node.js, Express
- Database: Supabase PostgreSQL
- Authentication: bcrypt password hashes, short-lived JWT access tokens, and an HTTP-only refresh cookie

## Features and current limits

- Login and role-aware Admin, Teacher, and Student views.
- Authenticated department listing/details and Admin create/update.
- Authenticated course listing/filtering and Admin/Teacher creation.
- Server-side role checks and request validation.
- Department statistics calculated from the users and courses tables.
- Admins can view accounts, create Teacher/Student accounts, and update non-admin roles from the Users page. There are still no department-delete, course-update/delete, enrollment, or student roster APIs.
- Logout immediately clears the frontend's session-storage user and access token, then calls the backend to revoke the current token version and expire its HTTP-only cookie. The backend checks that version on every protected request, so logout invalidates that session's access and refresh tokens. If server-side revocation cannot be confirmed, the login page displays a warning. The frontend currently does not automatically refresh access tokens.

## Prerequisites

- Node.js compatible with the installed Vite version (Node 20.19+ or 22.12+).
- npm.
- A Supabase project with the schema already applied.

## Configuration

### Backend

In PowerShell:

```powershell
Set-Location server
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `server/.env` locally and supply:

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the backend-only service-role key. Never put this in the client or commit it.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: two different randomly generated secrets, each at least 32 characters.
- `PORT`: defaults to 3000 locally; Render supplies the production port.
- `CLIENT_URL`: exact frontend origin, such as `https://your-vercel-project.vercel.app`. Required in production. In development, HTTP origins on `localhost` and `127.0.0.1` are accepted so Vite's fallback port works.
- `NODE_ENV`: use `production` on Render. Production requires an HTTPS `CLIENT_URL`; the refresh cookie is Secure and uses `SameSite=None` to support the cross-site Vercel-to-Render request. Auth POST routes reject unexpected browser origins.

Never replace existing `server/.env` without preserving its credentials. The server loads it through `dotenv/config`. The root `.gitignore` excludes `.env` and `.env.*` while allowing the placeholder `.env.example` files.

### Frontend

By default, Vite proxies `/api` requests to `http://localhost:3000`; no client secret or API key is needed. To use a different backend origin, set `VITE_API_BASE_URL` in `client/.env.local` and configure the backend's `CLIENT_URL` to match the browser origin. Only public/non-secret configuration belongs in `VITE_*` variables.

In Vercel, set `VITE_API_BASE_URL` to the Render API origin, for example `https://your-render-service.onrender.com` (no trailing slash or `/api`). This value is public configuration; never put Supabase or JWT secrets in a `VITE_*` variable.

### Vercel deployment

When deploying this `department-management-system` folder, the root
`vercel.json` builds the Vite app from `client` and serves `client/dist`,
including the SPA route rewrite. If configuring the Vercel project manually,
use `npm --prefix client run build` as the build command and `client/dist` as
the output directory. Set `VITE_API_BASE_URL` in the Vercel project environment
variables before building.

### Netlify deployment

The root `netlify.toml` installs the locked frontend dependencies (including
Vite's development dependencies), builds the app from `client`, publishes
`client/dist`, and rewrites SPA routes to `index.html`. For a manual
drag-and-drop deploy, first run `npm --prefix client ci --include=dev` and
`npm --prefix client run build`, then upload the contents of `client/dist`
(not the project root or `client` source folder). The Netlify build config
sets the public API origin to `https://campusflow-api.onrender.com`; update it
if the Render service uses a different hostname. Set the Render service's
`CLIENT_URL` to the exact Netlify site origin before testing login.

## Database setup

The schema is in [`server/database/schema.sql`](./server/database/schema.sql). For a new, empty Supabase database, review the file and run it once in the Supabase SQL Editor. Do not rerun it on a database where the tables already exist: it creates tables, a trigger, and constraints and is not an upgrade script. No schema changes are applied automatically by this project.

The schema defines `users`, `departments`, `courses`, `enrollments`, and `api_logs`, with UUID primary keys and the foreign keys, checks, uniqueness rules, and indexes needed by the current API. The user table includes the refresh-token version field used by authentication.

The app uses custom backend authentication, not Supabase Auth. User accounts and lowercase roles are stored in `public.users`; the database-generated `users.user_id` is the account ID and the JWT subject. There is no separate Supabase Auth ID to link. On an existing database, manually review and run [`server/database/migrations/20261104_normalize_user_roles.sql`](./server/database/migrations/20261104_normalize_user_roles.sql) once before using the lowercase-role application code. This converts the existing role values and constraint. The migration is not run by the app and has not been applied to the live database.

### Account provisioning

- Student self-registration uses `POST /api/auth/register` and can only create the `student` role.
- An authenticated Admin can create Teacher and Student accounts from the Users dashboard. Passwords are bcrypt-hashed by the backend and never returned.
- Admin accounts cannot be created through public registration or the Admin UI. Provision an initial/extra Admin from a trusted backend terminal after configuring `server/.env`:

  ```powershell
  Set-Location server
  npm run create-admin
  ```

  The command prompts for account details and masks password entry. It uses the server-only Supabase service-role key and inserts the hashed password into `public.users`. Do not deploy this command as a public endpoint.
- Login offers Admin/Teacher/Student account-type options. The backend compares the selected option with the role loaded from the database after password verification; the selection does not grant permissions. Protected API middleware fetches the current user role from `public.users` on every request, so role changes take effect for authorization on the next request.

## Run locally

Use two PowerShell terminals from the project root.

Backend:

```powershell
Set-Location server
npm install
npm run dev
```

Frontend:

```powershell
Set-Location client
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The API health check is `http://localhost:3000/api/health` and returns JSON when the backend is running.

## Testing

Backend automated tests:

```powershell
Set-Location server
npm test
```

These use an in-memory Supabase-compatible adapter and synthetic test users/tokens. They validate API behavior but do not prove live Supabase data or authentication.

Frontend tests, lint, and production build:

```powershell
Set-Location client
npm test
npm run lint
npm run build
```

The frontend tests mock HTTP responses and validate login/API-token/session behavior; they are not live backend tests.

For live Supabase verification, configure `server/.env`, start the API, and use real active database records and JWTs. Do not report authenticated live tests as passed unless requests were made against those records. Existing automated tests never write to Supabase.

## Deployment

Deployment is not performed by this repository setup. The following steps create services in your own Render, Vercel, and Supabase accounts; review the configuration and perform them yourself.

### Render backend

The root [`render.yaml`](./render.yaml) is a Render Blueprint for a Node web service. In Render, connect the repository and create the Blueprint service, then configure its environment values in the Render dashboard:

1. **Root directory:** `server`
2. **Runtime:** Node
3. **Build command:** `npm install`
4. **Start command:** `npm start` (runs `node src/server.js`)
5. **Health check path:** `/api/health`
6. Set `NODE_ENV=production`.
7. Set `CLIENT_URL` to the exact HTTPS Vercel production origin, with no path or trailing slash.
8. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` as private Render environment variables. Generate distinct random JWT secrets of at least 32 characters. Do not commit or share them.

Render supplies `PORT`; do not set it manually unless Render specifically requires it. The server listens on `process.env.PORT` and falls back to 3000 locally.

### Vercel frontend

1. Import the repository in Vercel.
2. Set **Root Directory** to `client`.
3. Use the Vite framework preset, **Build Command** `npm run build`, and **Output Directory** `dist`.
4. Add `VITE_API_BASE_URL` in the Vercel project environment variables for Production and Preview. Set it to the Render service HTTPS origin (example: `https://your-render-service.onrender.com`), not a secret.
5. Deploy and copy the production site origin. Set Render's `CLIENT_URL` to that exact origin and redeploy/restart the backend.
6. `client/vercel.json` rewrites SPA paths to `index.html`, so refreshing client routes such as `/student` reaches React Router.

If Vercel Preview deployments need API access, add their exact origin to backend CORS/auth origin configuration before testing. Do not use a permissive wildcard with credentialed cookies.

### Supabase and post-deployment checks

Use the existing Supabase project and schema; do not rerun `server/database/schema.sql` against an existing installation. In Supabase, allow connections from your deployment as required by the project's network settings. Keep the service-role key only in Render.

After both services deploy:

1. Open `https://<your-render-service>.onrender.com/api/health`; expect HTTP 200 JSON with `status: "ok"`.
2. Open the Vercel frontend and refresh a protected route while signed out; it should resolve to the login page rather than a platform 404.
3. In browser developer tools, verify a login request reaches the Render API, the refresh cookie is HttpOnly/Secure, and no secret values appear in frontend assets or requests.
4. Use a real active Supabase user to test login, an authenticated GET, and logout. Confirm logout returns 204 and subsequent use of the old access token returns 401. Until you perform this with a real user, live authentication remains unverified.

## API reference

See [`docs/API.md`](./docs/API.md) for the routes currently registered, required roles, request examples, and response shapes.

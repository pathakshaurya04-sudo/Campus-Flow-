# CampusFlow frontend

React and Vite frontend foundation for the Department Management System.

## Run locally

From this directory:

```powershell
npm install
npm run dev
```

The frontend uses `http://localhost:3000` as its default Express API URL. To
use a different backend URL, create a local `.env` file with:

```env
VITE_API_BASE_URL=http://localhost:3000
```

Only public configuration such as the backend URL belongs in frontend
environment variables. Never put Supabase service-role keys, JWT signing
secrets, or other server credentials in the client.

## Available routes

- `/login` — sign in through `POST /api/auth/login`
- `/admin`, `/teacher`, `/student` — role-specific dashboard entry points
- `/departments` — reads `GET /api/departments`
- `/courses` — reads `GET /api/courses`

The dashboard and catalog pages are a frontend foundation; management actions
and additional academic features are not included yet.

## Checks

```powershell
npm run build
npm run lint
```

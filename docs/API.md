# Implemented API reference

Base URL for local development: `http://localhost:3000`. All protected routes require `Authorization: Bearer <access-token>`. The backend retrieves the current role from the database for the token subject; a role supplied by the frontend is not authoritative.

## Health

### `GET /api/health`

Public liveness check.

Success (`200`):

```json
{ "status": "ok", "message": "API is healthy" }
```

## Authentication

### `POST /api/auth/register`

Public student self-registration only. The body requires `email`, `password`, `full_name`, `role` set to `"student"`, and a UUID `department_id`; `phone` is optional and nullable. Passwords must be at least 12 characters with lowercase, uppercase, numeric, and special characters. Admin/Teacher values are rejected with `403`.

Success (`201`):

```json
{ "user": { "user_id": "<uuid>", "email": "student@example.edu", "full_name": "Example Student", "role": "student", "department_id": "<uuid>", "phone": null, "created_at": "<timestamp>", "updated_at": "<timestamp>", "is_active": true } }
```

Errors: `400` invalid input/department, `403` roles other than student, `409` duplicate email, `503` service unavailable.

### `POST /api/auth/login`

Public. Body: `{ "email": "...", "password": "...", "role": "admin|teacher|student" }`. The `role` field is an optional UI selection; when present, the backend compares it to the database role and returns `403` on mismatch. The selected role is never used to assign permissions.

Success (`200`) returns `access_token`, `token_type`, `expires_in`, and the user profile. The refresh token is set in an HTTP-only cookie and is not returned in JSON.

Errors: `400` invalid input, `401` invalid credentials, `403` selected role mismatch, `503` service unavailable.

### `POST /api/auth/refresh-token`

Public bearer-wise, but requires the HTTP-only refresh cookie set by login. Rotates the refresh token and returns a new access token and user profile.

Errors: `401` missing/invalid/expired or reused refresh token, `503` service unavailable.

### `POST /api/auth/logout`

Public bearer-wise, but uses the HTTP-only refresh cookie when present. Revokes the matching token version, expires the cookie, and returns `204 No Content`. Protected requests check the token version, so access and refresh tokens from that session are invalidated immediately. Calling without a cookie or with a stale/invalid refresh token also clears the cookie and returns `204`.

If the database cannot confirm revocation, returns `503`; the frontend still clears its local access token and user state and warns that server-side revocation could not be confirmed.

## Departments

All department routes require an access token.

### `GET /api/departments`

Any authenticated role. Returns `{ "departments": [...] }`, ordered by department name. Each row includes `dept_id`, `dept_name`, `dept_code`, `head_of_department`, `location`, `contact_email`, `total_staff`, `total_students`, and calculated `total_courses`.

### `GET /api/departments/:dept_id`

Any authenticated role. Returns `{ "department": { ... } }` with the same fields and calculated statistics.

Errors: `400` invalid UUID, `404` department not found.

### `POST /api/departments`

Admin only. Body:

```json
{
  "dept_name": "Science",
  "dept_code": "SCI",
  "head_of_department": null,
  "location": "Building A",
  "contact_email": "science@example.edu"
}
```

Success (`201`): `{ "department": { ... } }`. Department code is normalized to uppercase.

Errors: `400` invalid body/reference, `401` missing or invalid token, `403` insufficient role, `409` duplicate department data, `503` service unavailable.

### `PUT /api/departments/:dept_id`

Admin only. Body may contain one or more department fields supported by POST. Returns `{ "department": { ... } }` on success (`200`).

Errors: `400` invalid UUID/body, `401` missing or invalid token, `403` insufficient role, `404` department not found, `409` duplicate department data, `503` service unavailable.

## Courses

All course routes require an access token.

### `GET /api/courses`

Any authenticated role. Optional query parameters: `dept_id` (UUID) and `semester` (string). Returns `{ "courses": [...] }`; each course includes the associated `department` and `instructor` objects when available.

### `POST /api/courses`

Admin or Teacher only. Body:

```json
{
  "course_name": "Biology",
  "course_code": "BIO101",
  "dept_id": "<department-uuid>",
  "instructor_id": "<teacher-uuid>",
  "credits": 3,
  "semester": "Fall 2026",
  "max_capacity": 40
}
```

The department must exist, the instructor must be an existing Teacher, and capacity must be a positive integer. `enrolled_students` is initialized to zero.

Success (`201`): `{ "course": { ... } }`, including department and instructor information.

Errors: `400` invalid body/reference/instructor, `401` missing or invalid token, `403` insufficient role, `409` duplicate course code, `503` service unavailable.

## Users

These user-management routes require an authenticated `admin` role. User roles in the database are lowercase. The server loads the role from `public.users` for every protected request.

### `GET /api/users`

Admin only. Returns `{ "users": [...] }` with public user profiles only; password hashes and token fields are omitted.

### `POST /api/users`

Admin only. Creates a Teacher or Student account. Example body:

```json
{
  "email": "teacher@example.edu",
  "password": "<strong temporary password>",
  "full_name": "Example Teacher",
  "role": "teacher",
  "department_id": "<department-uuid>",
  "phone": null
}
```

Only `teacher` and `student` are accepted. Passwords are bcrypt-hashed server-side. Returns `201` with the public user profile. Errors include `400` invalid input/reference, `403` insufficient permission, `409` duplicate email, and `503` service unavailable.

### `PATCH /api/users/:user_id/role`

Admin only. Body: `{ "role": "teacher" }` or `{ "role": "student" }`. Admin records cannot be changed through this route. Returns the updated public user profile. Authorization middleware reads the new database role on the next authenticated request, including requests using an existing access token.

Admin accounts are provisioned only through the trusted backend command `npm run create-admin` from the `server` directory. There is no public Admin-registration route.

## Not implemented

There are no enrollment/roster, department-delete, course-update, or course-delete routes. The database has an `enrollments` table, but enrollment operations are not exposed by the current API.

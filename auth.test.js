import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, test } from "node:test";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import {
  createAuthMiddleware,
  requireRole,
} from "../src/middleware/auth.middleware.js";

process.env.JWT_ACCESS_SECRET = randomBytes(48).toString("hex");
process.env.JWT_REFRESH_SECRET = randomBytes(48).toString("hex");
process.env.CLIENT_URL = "http://localhost:5173";

const departmentId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const studentId = "33333333-3333-4333-8333-333333333333";
const adminPasswordHash = await bcrypt.hash("AdminPassword123!", 12);

class MemoryQuery {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.filters = {};
    this.action = "select";
    this.columns = "*";
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters[column] = value;
    return this;
  }

  insert(values) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  update(values) {
    this.action = "update";
    this.values = values;
    return this;
  }

  maybeSingle() {
    return this.execute();
  }

  single() {
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    if (this.table !== "users") {
      return { data: null, error: { code: "42P01" } };
    }

    if (this.action === "insert") {
      if (this.database.users.some((user) => user.email === this.values.email)) {
        return { data: null, error: { code: "23505" } };
      }

      const user = {
        ...this.values,
        user_id: randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        refresh_token_version: 0,
      };
      this.database.users.push(user);
      return { data: this.project(user), error: null };
    }

    const user = this.database.users.find((candidate) =>
      Object.entries(this.filters).every(
        ([key, value]) => candidate[key] === value,
      ),
    );

    if (this.action === "update" && user) {
      Object.assign(user, this.values);
    }

    return { data: user ? this.project(user) : null, error: null };
  }

  project(user) {
    if (this.columns === "*") {
      return { ...user };
    }

    const fields = this.columns.split(",").map((field) => field.trim());
    return Object.fromEntries(fields.map((field) => [field, user[field]]));
  }
}

const database = {
  users: [
    {
      user_id: adminId,
      email: "admin@example.com",
      password_hash: adminPasswordHash,
      full_name: "Test Admin",
      role: "admin",
      department_id: departmentId,
      phone: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
      refresh_token_version: 0,
    },
  ],
};

const supabaseClientProvider = () => ({
  from: (table) => new MemoryQuery(database, table),
});

const app = createApp({ supabaseClientProvider });
const protectedApp = express();
protectedApp.get(
  "/admin",
  createAuthMiddleware(supabaseClientProvider),
  requireRole("admin"),
  (request, response) => response.json({ role: request.auth.role }),
);

let appServer;
let protectedServer;
let appUrl;
let protectedUrl;

before(async () => {
  appServer = app.listen(0, "127.0.0.1");
  protectedServer = protectedApp.listen(0, "127.0.0.1");
  await Promise.all([once(appServer, "listening"), once(protectedServer, "listening")]);
  appUrl = `http://127.0.0.1:${appServer.address().port}`;
  protectedUrl = `http://127.0.0.1:${protectedServer.address().port}`;
});

after(async () => {
  await Promise.all(
    [appServer, protectedServer].map(
      (server) =>
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

test("registration, login, refresh, expiry, and role authorization", async () => {
  const registration = {
    email: "student@example.com",
    password: "StrongPassword123!",
    full_name: "Demo Student",
    role: "student",
    phone: "9876543210",
    department_id: departmentId,
  };

  const invalidRegistration = await fetch(`${appUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...registration, password: "weak", email: "invalid" }),
  });
  assert.equal(invalidRegistration.status, 400);

  const rejectedOriginLogin = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://untrusted.example",
    },
    body: JSON.stringify({
      email: "student@example.com",
      password: "StrongPassword123!",
    }),
  });
  assert.equal(rejectedOriginLogin.status, 403);

  const forbiddenRoleRegistration = await fetch(`${appUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...registration, role: "admin" }),
  });
  assert.equal(forbiddenRoleRegistration.status, 403);

  const registerResponse = await fetch(`${appUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registration),
  });
  assert.equal(registerResponse.status, 201);
  const registered = await registerResponse.json();
  assert.equal(registered.user.role, "student");
  assert.equal("password_hash" in registered.user, false);
  assert.notEqual(
    database.users.find((user) => user.email === registration.email).password_hash,
    registration.password,
  );
  assert.equal(
    await bcrypt.compare(
      registration.password,
      database.users.find((user) => user.email === registration.email).password_hash,
    ),
    true,
  );

  const duplicateResponse = await fetch(`${appUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registration),
  });
  assert.equal(duplicateResponse.status, 409);

  const incorrectPasswordResponse = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: registration.email, password: "WrongPassword123!" }),
  });
  assert.equal(incorrectPasswordResponse.status, 401);

  const mismatchedRoleLoginResponse = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: registration.email,
      password: registration.password,
      role: "admin",
    }),
  });
  assert.equal(mismatchedRoleLoginResponse.status, 403);
  assert.equal(mismatchedRoleLoginResponse.headers.get("set-cookie"), null);

  const studentLoginResponse = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: registration.email,
      password: registration.password,
      role: "student",
    }),
  });
  assert.equal(studentLoginResponse.status, 200);
  const studentLogin = await studentLoginResponse.json();
  assert.equal("password_hash" in studentLogin.user, false);
  const refreshCookie = studentLoginResponse.headers
    .get("set-cookie")
    .split(";")[0];
  assert.match(studentLoginResponse.headers.get("set-cookie"), /HttpOnly/i);

  const missingTokenResponse = await fetch(`${protectedUrl}/admin`);
  assert.equal(missingTokenResponse.status, 401);

  const expiredAccessToken = jwt.sign(
    { token_use: "access" },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      subject: studentId,
      expiresIn: -1,
      issuer: "department-management-system",
      audience: "department-management-system-client",
    },
  );
  const expiredTokenResponse = await fetch(`${protectedUrl}/admin`, {
    headers: { authorization: `Bearer ${expiredAccessToken}` },
  });
  assert.equal(expiredTokenResponse.status, 401);

  const deniedRoleResponse = await fetch(`${protectedUrl}/admin`, {
    headers: { authorization: `Bearer ${studentLogin.access_token}` },
  });
  assert.equal(deniedRoleResponse.status, 403);

  const adminLoginResponse = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin@example.com",
      password: "AdminPassword123!",
    }),
  });
  assert.equal(adminLoginResponse.status, 200);
  const adminLogin = await adminLoginResponse.json();
  const allowedRoleResponse = await fetch(`${protectedUrl}/admin`, {
    headers: { authorization: `Bearer ${adminLogin.access_token}` },
  });
  assert.equal(allowedRoleResponse.status, 200);
  assert.deepEqual(await allowedRoleResponse.json(), { role: "admin" });

  const refreshResponse = await fetch(`${appUrl}/api/auth/refresh-token`, {
    method: "POST",
    headers: { cookie: refreshCookie },
  });
  assert.equal(refreshResponse.status, 200);
  assert.ok((await refreshResponse.json()).access_token);
  assert.match(refreshResponse.headers.get("set-cookie"), /HttpOnly/i);
  const rotatedCookie = refreshResponse.headers.get("set-cookie").split(";")[0];

  const secondRefreshResponse = await fetch(
    `${appUrl}/api/auth/refresh-token`,
    {
      method: "POST",
      headers: { cookie: rotatedCookie },
    },
  );
  assert.equal(secondRefreshResponse.status, 200);
  const secondRefresh = await secondRefreshResponse.json();
  const latestRefreshCookie = secondRefreshResponse.headers
    .get("set-cookie")
    .split(";")[0];

  const reusedRefreshResponse = await fetch(
    `${appUrl}/api/auth/refresh-token`,
    {
      method: "POST",
      headers: { cookie: refreshCookie },
    },
  );
  assert.equal(reusedRefreshResponse.status, 401);

  const invalidRefreshResponse = await fetch(
    `${appUrl}/api/auth/refresh-token`,
    {
      method: "POST",
      headers: { cookie: "dms_refresh_token=invalid-token" },
    },
  );
  assert.equal(invalidRefreshResponse.status, 401);

  const logoutResponse = await fetch(`${appUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: latestRefreshCookie },
  });
  assert.equal(logoutResponse.status, 204);
  assert.match(logoutResponse.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(logoutResponse.headers.get("set-cookie"), /Expires=/i);

  const refreshedAccessResponse = await fetch(`${protectedUrl}/admin`, {
    headers: {
      authorization: `Bearer ${secondRefresh.access_token}`,
    },
  });
  assert.equal(refreshedAccessResponse.status, 401);

  const loggedOutRefreshResponse = await fetch(
    `${appUrl}/api/auth/refresh-token`,
    {
      method: "POST",
      headers: { cookie: latestRefreshCookie },
    },
  );
  assert.equal(loggedOutRefreshResponse.status, 401);

  const logoutWithoutCookieResponse = await fetch(`${appUrl}/api/auth/logout`, {
    method: "POST",
  });
  assert.equal(logoutWithoutCookieResponse.status, 204);
  assert.match(logoutWithoutCookieResponse.headers.get("set-cookie"), /Expires=/i);
});

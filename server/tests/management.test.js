import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { createAccessToken } from "../src/auth/tokens.js";

process.env.JWT_ACCESS_SECRET = randomBytes(48).toString("hex");
process.env.JWT_REFRESH_SECRET = randomBytes(48).toString("hex");
process.env.CLIENT_URL = "http://localhost:5173";

const departmentId = "11111111-1111-4111-8111-111111111111";
const secondDepartmentId = "44444444-4444-4444-8444-444444444444";
const adminId = "22222222-2222-4222-8222-222222222222";
const teacherId = "33333333-3333-4333-8333-333333333333";
const studentId = "55555555-5555-4555-8555-555555555555";

const database = {
  departments: [
    {
      dept_id: departmentId,
      dept_name: "Science",
      dept_code: "SCI",
      head_of_department: teacherId,
      location: "Building A",
      contact_email: "science@example.com",
      total_staff: 0,
      total_students: 0,
    },
  ],
  users: [
    {
      user_id: adminId,
      email: "admin@example.com",
      full_name: "Test Admin",
      role: "admin",
      department_id: departmentId,
      phone: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      is_active: true,
      refresh_token_version: 0,
    },
    {
      user_id: teacherId,
      email: "teacher@example.com",
      full_name: "Test Teacher",
      role: "teacher",
      department_id: departmentId,
      phone: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      is_active: true,
      refresh_token_version: 0,
    },
    {
      user_id: studentId,
      email: "student@example.com",
      full_name: "Test Student",
      role: "student",
      department_id: departmentId,
      phone: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      is_active: true,
      refresh_token_version: 0,
    },
  ],
  courses: [
    {
      course_id: "66666666-6666-4666-8666-666666666666",
      course_name: "Biology",
      course_code: "BIO101",
      dept_id: departmentId,
      instructor_id: teacherId,
      credits: 3,
      semester: "Fall 2026",
      max_capacity: 40,
      enrolled_students: 0,
    },
  ],
};

class MemoryQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.action = "select";
    this.options = {};
  }

  select(columns, options = {}) {
    this.columns = columns;
    this.options = options;
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column, value) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  ilike(column, value) {
    this.filters.push(
      (row) => String(row[column]).toLowerCase() === value.toLowerCase(),
    );
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.sort = { column, ascending };
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
    return this.execute(true);
  }

  single() {
    return this.execute(true);
  }

  then(resolve, reject) {
    return this.execute(false).then(resolve, reject);
  }

  project(row) {
    if (!this.columns || this.columns === "*") {
      return { ...row };
    }

    return Object.fromEntries(
      this.columns.split(",").map((column) => {
        const key = column.trim();
        return [key, row[key]];
      }),
    );
  }

  async execute(singleResult) {
    const tableRows = database[this.table];
    if (!tableRows) {
      return { data: null, error: { code: "42P01" } };
    }

    if (this.options.count === "exact" && this.options.head) {
      const count = tableRows.filter((row) =>
        this.filters.every((filter) => filter(row)),
      ).length;
      return { data: null, count, error: null };
    }

    if (this.action === "insert") {
      const duplicateColumn =
        this.table === "users"
          ? tableRows.some((row) => row.email === this.values.email)
            ? "email"
            : null
          : this.table === "departments"
          ? ["dept_name", "dept_code", "contact_email"].find((column) =>
              tableRows.some(
                (row) =>
                  String(row[column]).toLowerCase() ===
                  String(this.values[column]).toLowerCase(),
              ),
            )
          : this.table === "courses"
            ? tableRows.some(
                (row) =>
                  row.course_code.toLowerCase() ===
                  this.values.course_code.toLowerCase(),
              )
              ? "course_code"
              : null
            : null;

      if (duplicateColumn) {
        return { data: null, error: { code: "23505" } };
      }

      if (
        this.table === "users" &&
        this.values.department_id &&
        !database.departments.some(
          (department) => department.dept_id === this.values.department_id,
        )
      ) {
        return { data: null, error: { code: "23503" } };
      }

      if (
        this.table === "departments" &&
        this.values.head_of_department &&
        !database.users.some(
          (user) => user.user_id === this.values.head_of_department,
        )
      ) {
        return { data: null, error: { code: "23503" } };
      }
      if (
        this.table === "courses" &&
        (!database.departments.some(
          (department) => department.dept_id === this.values.dept_id,
        ) ||
          !database.users.some(
            (user) => user.user_id === this.values.instructor_id,
          ))
      ) {
        return { data: null, error: { code: "23503" } };
      }

      const idColumn =
        this.table === "departments"
          ? "dept_id"
          : this.table === "courses"
            ? "course_id"
            : "user_id";
      const row = {
        ...this.values,
        [idColumn]: randomUUID(),
        ...(this.table === "users"
          ? {
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              is_active: true,
              refresh_token_version: 0,
            }
          : {}),
      };
      tableRows.push(row);
      return { data: this.project(row), error: null };
    }

    let rows = tableRows.filter((row) =>
      this.filters.every((filter) => filter(row)),
    );
    if (this.action === "update") {
      rows.forEach((row) => Object.assign(row, this.values));
    }
    if (this.sort) {
      const { column, ascending } = this.sort;
      rows.sort((a, b) =>
        ascending
          ? String(a[column]).localeCompare(String(b[column]))
          : String(b[column]).localeCompare(String(a[column])),
      );
    }

    if (singleResult) {
      return {
        data: rows[0] ? this.project(rows[0]) : null,
        error: null,
      };
    }
    return { data: rows.map((row) => this.project(row)), error: null };
  }
}

const supabaseClientProvider = () => ({
  from: (table) => new MemoryQuery(table),
});
const app = createApp({ supabaseClientProvider });
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function authHeaders(userId, role) {
  const user = database.users.find((candidate) => candidate.user_id === userId);
  assert.equal(user.role, role);
  return { authorization: `Bearer ${createAccessToken(userId)}` };
}

async function request(path, { method = "GET", role = "student", userId = studentId, body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...authHeaders(userId, role),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("department and course APIs enforce validation, statistics, and roles", async () => {
  const departmentListResponse = await request("/api/departments");
  assert.equal(departmentListResponse.status, 200);
  const listedDepartments = await departmentListResponse.json();
  assert.equal(listedDepartments.departments[0].dept_id, departmentId);
  assert.equal(listedDepartments.departments[0].total_staff, 2);
  assert.equal(listedDepartments.departments[0].total_students, 1);
  assert.equal(listedDepartments.departments[0].total_courses, 1);

  const departmentDetailsResponse = await request(
    `/api/departments/${departmentId}`,
  );
  assert.equal(departmentDetailsResponse.status, 200);
  assert.equal(
    (await departmentDetailsResponse.json()).department.dept_name,
    "Science",
  );
  assert.equal(
    (await request("/api/departments/not-a-uuid")).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/departments/77777777-7777-4777-8777-777777777777",
      )
    ).status,
    404,
  );

  const departmentBody = {
    dept_name: "Arts",
    dept_code: "DCSIS(IOT)",
    head_of_department: teacherId,
    location: "Building B",
    contact_email: "arts@example.com",
  };
  assert.equal(
    (
      await request("/api/departments", {
        method: "POST",
        body: departmentBody,
      })
    ).status,
    403,
  );
  const createdDepartmentResponse = await request("/api/departments", {
    method: "POST",
    role: "admin",
    userId: adminId,
    body: departmentBody,
  });
  assert.equal(createdDepartmentResponse.status, 201);
  const createdDepartment = (await createdDepartmentResponse.json()).department;
  assert.equal(createdDepartment.dept_code, "DCSIS(IOT)");
  assert.equal(createdDepartment.total_courses, 0);

  assert.equal(
    (
      await request("/api/departments", {
        method: "POST",
        role: "admin",
        userId: adminId,
        body: { ...departmentBody, dept_name: "Other Arts" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/departments/${createdDepartment.dept_id}`, {
        method: "PUT",
        body: { dept_name: "No Permission" },
      })
    ).status,
    403,
  );
  const updatedDepartmentResponse = await request(
    `/api/departments/${createdDepartment.dept_id}`,
    {
      method: "PUT",
      role: "admin",
      userId: adminId,
      body: { dept_name: "Fine Arts" },
    },
  );
  assert.equal(updatedDepartmentResponse.status, 200);
  assert.equal(
    (await updatedDepartmentResponse.json()).department.dept_name,
    "Fine Arts",
  );

  const courseListResponse = await request(
    "/api/courses?dept_id=" + departmentId + "&semester=Fall%202026",
  );
  assert.equal(courseListResponse.status, 200);
  const listedCourses = await courseListResponse.json();
  assert.equal(listedCourses.courses.length, 1);
  assert.equal(listedCourses.courses[0].instructor.full_name, "Test Teacher");
  assert.equal(listedCourses.courses[0].department.dept_name, "Science");

  const courseBody = {
    course_name: "Chemistry",
    course_code: "chem201",
    dept_id: departmentId,
    instructor_id: teacherId,
    credits: 4,
    semester: "Spring 2027",
    max_capacity: 25,
  };
  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        body: courseBody,
      })
    ).status,
    403,
  );
  const createdCourseResponse = await request("/api/courses", {
    method: "POST",
    role: "teacher",
    userId: teacherId,
    body: courseBody,
  });
  assert.equal(createdCourseResponse.status, 201);
  const createdCourse = (await createdCourseResponse.json()).course;
  assert.equal(createdCourse.course_code, "CHEM201");
  assert.equal(createdCourse.enrolled_students, 0);
  assert.equal(createdCourse.instructor.user_id, teacherId);

  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        role: "teacher",
        userId: teacherId,
        body: { ...courseBody, course_name: "Duplicate" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        role: "teacher",
        userId: teacherId,
        body: { ...courseBody, max_capacity: 0 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        role: "teacher",
        userId: teacherId,
        body: {
          ...courseBody,
          dept_id: "77777777-7777-4777-8777-777777777777",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        role: "teacher",
        userId: teacherId,
        body: { ...courseBody, instructor_id: studentId },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        role: "teacher",
        userId: teacherId,
        body: { ...courseBody, instructor_id: "not-a-uuid" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/courses?dept_id=not-a-uuid")).status,
    400,
  );
});

test("Admin manages teacher and student accounts and database roles are authoritative", async () => {
  const studentToken = createAccessToken(studentId, 0);
  const userBody = {
    email: "new-teacher@example.com",
    password: "StrongPassword123!",
    full_name: "New Teacher",
    role: "teacher",
    department_id: departmentId,
    phone: null,
  };

  const teacherListResponse = await request("/api/users/teachers", {
    role: "admin",
    userId: adminId,
  });
  assert.equal(teacherListResponse.status, 200);
  const listedTeachers = (await teacherListResponse.json()).teachers;
  assert.deepEqual(
    listedTeachers.map(({ user_id, full_name }) => ({ user_id, full_name })),
    [{ user_id: teacherId, full_name: "Test Teacher" }],
  );
  assert.equal("password_hash" in listedTeachers[0], false);
  assert.equal(
    (
      await request("/api/users/teachers", {
        role: "student",
        userId: studentId,
      })
    ).status,
    403,
  );

  assert.equal((await request("/api/users")).status, 403);
  assert.equal(
    (await request("/api/users", { method: "POST", body: userBody })).status,
    403,
  );
  assert.equal(
    (
      await request("/api/users", {
        method: "POST",
        role: "admin",
        userId: adminId,
        body: { ...userBody, role: "admin" },
      })
    ).status,
    400,
  );

  const createdResponse = await request("/api/users", {
    method: "POST",
    role: "admin",
    userId: adminId,
    body: userBody,
  });
  assert.equal(createdResponse.status, 201);
  const createdUser = (await createdResponse.json()).user;
  assert.equal(createdUser.role, "teacher");
  assert.equal("password_hash" in createdUser, false);
  assert.notEqual(
    database.users.find((user) => user.user_id === createdUser.user_id).password_hash,
    userBody.password,
  );
  assert.equal(
    await bcrypt.compare(
      userBody.password,
      database.users.find((user) => user.user_id === createdUser.user_id).password_hash,
    ),
    true,
  );

  const listedResponse = await request("/api/users", {
    role: "admin",
    userId: adminId,
  });
  assert.equal(listedResponse.status, 200);
  assert.ok((await listedResponse.json()).users.some((user) => user.user_id === createdUser.user_id));

  const duplicateResponse = await request("/api/users", {
    method: "POST",
    role: "admin",
    userId: adminId,
    body: userBody,
  });
  assert.equal(duplicateResponse.status, 409);

  const createdStudentResponse = await request("/api/users", {
    method: "POST",
    role: "admin",
    userId: adminId,
    body: {
      ...userBody,
      email: "new-student@example.com",
      full_name: "New Student",
      role: "student",
    },
  });
  assert.equal(createdStudentResponse.status, 201);
  const createdStudent = (await createdStudentResponse.json()).user;
  assert.equal(createdStudent.role, "student");

  const changedRoleResponse = await request(
    `/api/users/${studentId}/role`,
    {
      method: "PATCH",
      role: "admin",
      userId: adminId,
      body: { role: "teacher" },
    },
  );
  assert.equal(changedRoleResponse.status, 200);
  assert.equal((await changedRoleResponse.json()).user.role, "teacher");

  const oldTokenCourseResponse = await fetch(`${baseUrl}/api/courses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${studentToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      course_name: "Role Updated",
      course_code: "ROLE101",
      dept_id: departmentId,
      instructor_id: studentId,
      credits: 3,
      semester: "Fall 2027",
      max_capacity: 20,
    }),
  });
  assert.equal(oldTokenCourseResponse.status, 201);

  const protectedAdminRoleResponse = await request(
    `/api/users/${adminId}/role`,
    {
      method: "PATCH",
      role: "admin",
      userId: adminId,
      body: { role: "student" },
    },
  );
  assert.equal(protectedAdminRoleResponse.status, 403);
});

test("department and course APIs reject missing and invalid access tokens", async () => {
  for (const path of ["/api/departments", "/api/courses"]) {
    const missingTokenResponse = await fetch(`${baseUrl}${path}`);
    assert.equal(missingTokenResponse.status, 401);

    const invalidTokenResponse = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: "Bearer invalid-token" },
    });
    assert.equal(invalidTokenResponse.status, 401);
  }
});

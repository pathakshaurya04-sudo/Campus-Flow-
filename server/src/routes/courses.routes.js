import { Router } from "express";
import { z } from "zod";
import { createAuthMiddleware, requireRole } from "../middleware/auth.middleware.js";

const COURSE_COLUMNS =
  "course_id,course_name,course_code,dept_id,instructor_id,credits,semester,max_capacity,enrolled_students";
const UUID_SCHEMA = z.string().uuid();

const courseCreateSchema = z
  .object({
    course_name: z.string().trim().min(1).max(150),
    course_code: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),
    dept_id: z.string().uuid(),
    instructor_id: z.string().uuid(),
    credits: z.number().int().min(1).max(32767),
    semester: z.string().trim().min(1).max(30),
    max_capacity: z.number().int().positive(),
  })
  .strict();

const courseQuerySchema = z
  .object({
    dept_id: z.string().uuid().optional(),
    semester: z.string().trim().min(1).max(30).optional(),
  })
  .strict();

function logDatabaseError(operation, error) {
  console.error(`Course ${operation} failed:`, error?.code || "UNKNOWN");
}

function sendValidationError(response, error) {
  return response.status(400).json({
    error: "Invalid request",
    details: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function databaseUnavailable(response, operation, error) {
  logDatabaseError(operation, error);
  return response.status(503).json({ error: "Course service is unavailable" });
}

export function createCoursesRouter({ supabaseClientProvider }) {
  const router = Router();
  const authenticate = createAuthMiddleware(supabaseClientProvider);

  router.get("/", authenticate, async (request, response) => {
    const parsedQuery = courseQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(response, parsedQuery.error);
    }

    try {
      const supabase = supabaseClientProvider();
      let query = supabase.from("courses").select(COURSE_COLUMNS);
      if (parsedQuery.data.dept_id) {
        query = query.eq("dept_id", parsedQuery.data.dept_id);
      }
      if (parsedQuery.data.semester) {
        query = query.eq("semester", parsedQuery.data.semester);
      }

      const { data: courses, error } = await query.order("course_name", {
        ascending: true,
      });
      if (error) {
        return databaseUnavailable(response, "list", error);
      }

      const departmentIds = [...new Set((courses ?? []).map((course) => course.dept_id))];
      const instructorIds = [
        ...new Set((courses ?? []).map((course) => course.instructor_id)),
      ];

      const [departmentsResult, instructorsResult] = await Promise.all([
        departmentIds.length
          ? supabase
              .from("departments")
              .select("dept_id,dept_name,dept_code")
              .in("dept_id", departmentIds)
          : Promise.resolve({ data: [], error: null }),
        instructorIds.length
          ? supabase
              .from("users")
              .select("user_id,full_name,email")
              .in("user_id", instructorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (departmentsResult.error) {
        return databaseUnavailable(response, "department lookup", departmentsResult.error);
      }
      if (instructorsResult.error) {
        return databaseUnavailable(response, "instructor lookup", instructorsResult.error);
      }

      const departmentsById = new Map(
        (departmentsResult.data ?? []).map((department) => [
          department.dept_id,
          department,
        ]),
      );
      const instructorsById = new Map(
        (instructorsResult.data ?? []).map((instructor) => [
          instructor.user_id,
          instructor,
        ]),
      );

      return response.status(200).json({
        courses: (courses ?? []).map((course) => ({
          ...course,
          department: departmentsById.get(course.dept_id) ?? null,
          instructor: instructorsById.get(course.instructor_id) ?? null,
        })),
      });
    } catch (error) {
      return databaseUnavailable(response, "list", error);
    }
  });

  router.post(
    "/",
    authenticate,
    requireRole("admin", "teacher"),
    async (request, response) => {
      const parsed = courseCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendValidationError(response, parsed.error);
      }

      try {
        const supabase = supabaseClientProvider();
        const [departmentResult, instructorResult, duplicateResult] =
          await Promise.all([
            supabase
              .from("departments")
              .select("dept_id")
              .eq("dept_id", parsed.data.dept_id)
              .maybeSingle(),
            supabase
              .from("users")
              .select("user_id,role")
              .eq("user_id", parsed.data.instructor_id)
              .maybeSingle(),
            supabase
              .from("courses")
              .select("course_id")
              .ilike("course_code", parsed.data.course_code)
              .maybeSingle(),
          ]);

        const failedLookup = [
          departmentResult,
          instructorResult,
          duplicateResult,
        ].find((result) => result.error);
        if (failedLookup) {
          return databaseUnavailable(response, "creation lookup", failedLookup.error);
        }

        if (!departmentResult.data) {
          return response.status(400).json({ error: "Invalid dept_id" });
        }
        if (!instructorResult.data || instructorResult.data.role !== "teacher") {
          return response
            .status(400)
            .json({ error: "instructor_id must identify an existing Teacher" });
        }
        if (duplicateResult.data) {
          return response.status(409).json({ error: "Course code is already in use" });
        }

        const { data: course, error } = await supabase
          .from("courses")
          .insert({
            ...parsed.data,
            enrolled_students: 0,
          })
          .select(COURSE_COLUMNS)
          .single();

        if (error?.code === "23505") {
          return response.status(409).json({ error: "Course code is already in use" });
        }
        if (error?.code === "23503") {
          return response.status(400).json({ error: "Invalid department or instructor" });
        }
        if (error) {
          return databaseUnavailable(response, "creation", error);
        }

        const [department, instructor] = await Promise.all([
          supabase
            .from("departments")
            .select("dept_id,dept_name,dept_code")
            .eq("dept_id", course.dept_id)
            .maybeSingle(),
          supabase
            .from("users")
            .select("user_id,full_name,email")
            .eq("user_id", course.instructor_id)
            .maybeSingle(),
        ]);

        if (department.error || instructor.error) {
          return databaseUnavailable(
            response,
            "course relationship lookup",
            department.error || instructor.error,
          );
        }

        return response.status(201).json({
          course: {
            ...course,
            department: department.data,
            instructor: instructor.data,
          },
        });
      } catch (error) {
        return databaseUnavailable(response, "creation", error);
      }
    },
  );

  return router;
}

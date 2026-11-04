import { Router } from "express";
import { z } from "zod";
import { createAuthMiddleware, requireRole } from "../middleware/auth.middleware.js";

const DEPARTMENT_COLUMNS =
  "dept_id,dept_name,dept_code,head_of_department,location,contact_email,total_staff,total_students";
const UUID_SCHEMA = z.string().uuid();

const departmentCreateSchema = z
  .object({
    dept_name: z.string().trim().min(1).max(150),
    dept_code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9_()-]+$/)
      .transform((value) => value.toUpperCase()),
    head_of_department: z.string().uuid().nullable().optional(),
    location: z.string().trim().min(1).max(255),
    contact_email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  })
  .strict();

const departmentUpdateSchema = departmentCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one department field is required",
  });

function logDatabaseError(operation, error) {
  console.error(`Department ${operation} failed:`, error?.code || "UNKNOWN");
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
  return response.status(503).json({ error: "Department service is unavailable" });
}

async function getDepartmentStatistics(supabase, deptId) {
  const [staffResult, studentResult, courseResult] = await Promise.all([
    supabase
      .from("users")
      .select("user_id", { count: "exact", head: true })
      .eq("department_id", deptId)
      .neq("role", "student"),
    supabase
      .from("users")
      .select("user_id", { count: "exact", head: true })
      .eq("department_id", deptId)
      .eq("role", "student"),
    supabase
      .from("courses")
      .select("course_id", { count: "exact", head: true })
      .eq("dept_id", deptId),
  ]);

  const failedResult = [staffResult, studentResult, courseResult].find(
    (result) => result.error,
  );
  if (failedResult) {
    throw failedResult.error;
  }

  return {
    total_staff: staffResult.count ?? 0,
    total_students: studentResult.count ?? 0,
    total_courses: courseResult.count ?? 0,
  };
}

async function includeStatistics(supabase, department) {
  const statistics = await getDepartmentStatistics(supabase, department.dept_id);
  return { ...department, ...statistics };
}

export function createDepartmentsRouter({ supabaseClientProvider }) {
  const router = Router();
  const authenticate = createAuthMiddleware(supabaseClientProvider);

  router.get("/", authenticate, async (_request, response) => {
    try {
      const supabase = supabaseClientProvider();
      const { data: departments, error } = await supabase
        .from("departments")
        .select(DEPARTMENT_COLUMNS)
        .order("dept_name", { ascending: true });

      if (error) {
        return databaseUnavailable(response, "list", error);
      }

      const result = await Promise.all(
        (departments ?? []).map((department) =>
          includeStatistics(supabase, department),
        ),
      );
      return response.status(200).json({ departments: result });
    } catch (error) {
      return databaseUnavailable(response, "list", error);
    }
  });

  router.get("/:dept_id", authenticate, async (request, response) => {
    const parsedId = UUID_SCHEMA.safeParse(request.params.dept_id);
    if (!parsedId.success) {
      return sendValidationError(response, parsedId.error);
    }

    try {
      const supabase = supabaseClientProvider();
      const { data: department, error } = await supabase
        .from("departments")
        .select(DEPARTMENT_COLUMNS)
        .eq("dept_id", parsedId.data)
        .maybeSingle();

      if (error) {
        return databaseUnavailable(response, "details", error);
      }
      if (!department) {
        return response.status(404).json({ error: "Department not found" });
      }

      return response
        .status(200)
        .json({ department: await includeStatistics(supabase, department) });
    } catch (error) {
      return databaseUnavailable(response, "details", error);
    }
  });

  router.post(
    "/",
    authenticate,
    requireRole("admin"),
    async (request, response) => {
      const parsed = departmentCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendValidationError(response, parsed.error);
      }

      try {
        const supabase = supabaseClientProvider();
        const { data: existingDepartment, error: lookupError } = await supabase
          .from("departments")
          .select("dept_id")
          .ilike("dept_code", parsed.data.dept_code)
          .maybeSingle();

        if (lookupError) {
          return databaseUnavailable(response, "creation lookup", lookupError);
        }
        if (existingDepartment) {
          return response
            .status(409)
            .json({ error: "Department code is already in use" });
        }

        const { data: department, error } = await supabase
          .from("departments")
          .insert(parsed.data)
          .select(DEPARTMENT_COLUMNS)
          .single();

        if (error?.code === "23505") {
          return response
            .status(409)
            .json({ error: "Department name, code, or email is already in use" });
        }
        if (error?.code === "23503") {
          return response.status(400).json({ error: "Invalid head_of_department" });
        }
        if (error) {
          return databaseUnavailable(response, "creation", error);
        }

        return response.status(201).json({
          department: await includeStatistics(supabase, department),
        });
      } catch (error) {
        return databaseUnavailable(response, "creation", error);
      }
    },
  );

  router.put(
    "/:dept_id",
    authenticate,
    requireRole("admin"),
    async (request, response) => {
      const parsedId = UUID_SCHEMA.safeParse(request.params.dept_id);
      if (!parsedId.success) {
        return sendValidationError(response, parsedId.error);
      }

      const parsed = departmentUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendValidationError(response, parsed.error);
      }

      try {
        const supabase = supabaseClientProvider();
        const { data: department, error } = await supabase
          .from("departments")
          .update(parsed.data)
          .eq("dept_id", parsedId.data)
          .select(DEPARTMENT_COLUMNS)
          .maybeSingle();

        if (error?.code === "23505") {
          return response
            .status(409)
            .json({ error: "Department name, code, or email is already in use" });
        }
        if (error?.code === "23503") {
          return response.status(400).json({ error: "Invalid head_of_department" });
        }
        if (error) {
          return databaseUnavailable(response, "update", error);
        }
        if (!department) {
          return response.status(404).json({ error: "Department not found" });
        }

        return response
          .status(200)
          .json({ department: await includeStatistics(supabase, department) });
      } catch (error) {
        return databaseUnavailable(response, "update", error);
      }
    },
  );

  return router;
}

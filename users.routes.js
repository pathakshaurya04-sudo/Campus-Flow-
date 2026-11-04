import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createAuthMiddleware, requireRole } from "../middleware/auth.middleware.js";
import {
  toUserProfile,
  USER_PROFILE_COLUMNS,
} from "../auth/user-profile.js";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /\d/.test(value), "Password must include a number")
  .refine((value) => /[^A-Za-z0-9]/.test(value), "Password must include a special character")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );

const createUserSchema = z
  .object({
    email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
    password: passwordSchema,
    full_name: z.string().trim().min(1).max(150),
    role: z.enum(["teacher", "student"]),
    department_id: z.string().uuid(),
    phone: z.string().trim().min(1).max(30).nullable().optional(),
  })
  .strict();

const roleUpdateSchema = z
  .object({
    role: z.enum(["teacher", "student"]),
  })
  .strict();

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
  console.error(`User ${operation} failed:`, error?.code || "UNKNOWN");
  return response.status(503).json({ error: "User service is unavailable" });
}

export function createUsersRouter({ supabaseClientProvider }) {
  const router = Router();
  const authenticate = createAuthMiddleware(supabaseClientProvider);

  router.get(
    "/teachers",
    authenticate,
    requireRole("admin", "teacher"),
    async (_request, response) => {
      try {
        const { data: teachers, error } = await supabaseClientProvider()
          .from("users")
          .select("user_id,full_name,email,department_id")
          .eq("role", "teacher")
          .eq("is_active", true)
          .order("full_name", { ascending: true });

        if (error) return databaseUnavailable(response, "teacher list", error);
        return response.status(200).json({ teachers: teachers ?? [] });
      } catch (error) {
        return databaseUnavailable(response, "teacher list", error);
      }
    },
  );

  router.get("/", authenticate, requireRole("admin"), async (_request, response) => {
    try {
      const { data: users, error } = await supabaseClientProvider()
        .from("users")
        .select(USER_PROFILE_COLUMNS)
        .order("created_at", { ascending: false });

      if (error) return databaseUnavailable(response, "list", error);
      return response.status(200).json({
        users: (users ?? []).map(toUserProfile),
      });
    } catch (error) {
      return databaseUnavailable(response, "list", error);
    }
  });

  router.post("/", authenticate, requireRole("admin"), async (request, response) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(response, parsed.error);

    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const { data: user, error } = await supabaseClientProvider()
        .from("users")
        .insert({
          email: parsed.data.email,
          password_hash: passwordHash,
          full_name: parsed.data.full_name,
          role: parsed.data.role,
          department_id: parsed.data.department_id,
          phone: parsed.data.phone ?? null,
        })
        .select(USER_PROFILE_COLUMNS)
        .single();

      if (error?.code === "23505") {
        return response.status(409).json({ error: "Email is already registered" });
      }
      if (error?.code === "23503") {
        return response.status(400).json({ error: "Invalid department_id" });
      }
      if (error) return databaseUnavailable(response, "creation", error);

      return response.status(201).json({ user: toUserProfile(user) });
    } catch (error) {
      return databaseUnavailable(response, "creation", error);
    }
  });

  router.patch(
    "/:user_id/role",
    authenticate,
    requireRole("admin"),
    async (request, response) => {
      const parsedId = z.string().uuid().safeParse(request.params.user_id);
      const parsedBody = roleUpdateSchema.safeParse(request.body);
      if (!parsedId.success) return sendValidationError(response, parsedId.error);
      if (!parsedBody.success) return sendValidationError(response, parsedBody.error);

      try {
        const supabase = supabaseClientProvider();
        const { data: existingUser, error: lookupError } = await supabase
          .from("users")
          .select("user_id,role")
          .eq("user_id", parsedId.data)
          .maybeSingle();

        if (lookupError) return databaseUnavailable(response, "role lookup", lookupError);
        if (!existingUser) return response.status(404).json({ error: "User not found" });
        if (existingUser.role === "admin") {
          return response.status(403).json({ error: "Admin roles can only be provisioned by the backend" });
        }

        const { data: user, error } = await supabase
          .from("users")
          .update({ role: parsedBody.data.role })
          .eq("user_id", parsedId.data)
          .neq("role", "admin")
          .select(USER_PROFILE_COLUMNS)
          .maybeSingle();

        if (error) return databaseUnavailable(response, "role update", error);
        if (!user) return response.status(403).json({ error: "Admin roles can only be provisioned by the backend" });
        return response.status(200).json({ user: toUserProfile(user) });
      } catch (error) {
        return databaseUnavailable(response, "role update", error);
      }
    },
  );

  return router;
}

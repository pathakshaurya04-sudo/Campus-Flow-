import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  createAccessToken,
  createRefreshToken,
  getJwtSecrets,
  verifyRefreshToken,
} from "../auth/tokens.js";
import {
  toUserProfile,
  USER_PROFILE_COLUMNS,
} from "../auth/user-profile.js";

const PASSWORD_MAX_BYTES = 72;
const REFRESH_COOKIE = "dms_refresh_token";
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const AUTH_USER_COLUMNS = `${USER_PROFILE_COLUMNS},password_hash,refresh_token_version`;

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /\d/.test(value), "Password must include a number")
  .refine(
    (value) => /[^A-Za-z0-9]/.test(value),
    "Password must include a special character",
  )
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES,
    "Password must be at most 72 UTF-8 bytes",
  );

const registerSchema = z
  .object({
    email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
    password: passwordSchema,
    full_name: z.string().trim().min(1).max(150),
    role: z.enum(["admin", "teacher", "student"]),
    phone: z.string().trim().min(1).max(30).nullable().optional(),
    department_id: z.string().uuid(),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
    role: z.enum(["admin", "teacher", "student"]).optional(),
    password: z
      .string()
      .min(1)
      .refine(
        (value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES,
        "Password must be at most 72 UTF-8 bytes",
      ),
  })
  .strict();

function isConfigurationError(error) {
  return error?.name === "ConfigurationError";
}

function logDatabaseError(operation, error) {
  console.error(`Authentication ${operation} failed:`, error?.code || "UNKNOWN");
}

function sendServerError(response, error) {
  if (isConfigurationError(error)) {
    return response.status(503).json({ error: "Authentication is not configured" });
  }

  console.error("Authentication request failed:", error?.name || "Error");
  return response.status(500).json({ error: "Internal server error" });
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

function refreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
  };
}

function setRefreshCookie(response, token) {
  response.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(response) {
  response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

function hasUnexpectedOrigin(request, response) {
  const origin = request.get("origin");
  if (!origin) return false;

  const isDevelopmentOrigin = () => {
    if (process.env.NODE_ENV === "production") return false;
    try {
      const parsedOrigin = new URL(origin);
      return (
        parsedOrigin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname)
      );
    } catch {
      return false;
    }
  };

  let clientOrigin;
  try {
    clientOrigin = new URL(
      process.env.CLIENT_URL || "http://localhost:5173",
    ).origin;
  } catch {
    return response.status(503).json({ error: "Authentication is not configured" });
  }

  if (origin === clientOrigin || isDevelopmentOrigin()) return false;
  response.status(403).json({ error: "Origin is not allowed" });
  return true;
}

export function createAuthRouter({ supabaseClientProvider }) {
  const router = Router();

  router.post("/register", async (request, response) => {
    if (hasUnexpectedOrigin(request, response)) return;
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(response, parsed.error);
    }
    if (parsed.data.role !== "student") {
      return response
        .status(403)
        .json({ error: "Only student self-registration is allowed" });
    }

    try {
      const supabase = supabaseClientProvider();
      const { data: existingUser, error: lookupError } = await supabase
        .from("users")
        .select("user_id")
        .eq("email", parsed.data.email)
        .maybeSingle();

      if (lookupError) {
        logDatabaseError("registration lookup", lookupError);
        return response.status(503).json({ error: "Registration is unavailable" });
      }

      if (existingUser) {
        return response.status(409).json({ error: "Email is already registered" });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const { data: user, error: insertError } = await supabase
        .from("users")
        .insert({
          email: parsed.data.email,
          password_hash: passwordHash,
          full_name: parsed.data.full_name,
          role: "student",
          department_id: parsed.data.department_id,
          phone: parsed.data.phone ?? null,
        })
        .select(USER_PROFILE_COLUMNS)
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          return response
            .status(409)
            .json({ error: "Email is already registered" });
        }
        if (insertError.code === "23503") {
          return response.status(400).json({ error: "Invalid department_id" });
        }
        logDatabaseError("registration insert", insertError);
        return response.status(503).json({ error: "Registration is unavailable" });
      }

      return response.status(201).json({ user: toUserProfile(user) });
    } catch (error) {
      return sendServerError(response, error);
    }
  });

  router.post("/login", async (request, response) => {
    if (hasUnexpectedOrigin(request, response)) return;
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(response, parsed.error);
    }

    try {
      const supabase = supabaseClientProvider();
      const { data: user, error } = await supabase
        .from("users")
        .select(AUTH_USER_COLUMNS)
        .eq("email", parsed.data.email)
        .maybeSingle();

      if (error) {
        logDatabaseError("login lookup", error);
        return response.status(503).json({ error: "Login is unavailable" });
      }

      const passwordMatches =
        user && user.is_active && (await bcrypt.compare(parsed.data.password, user.password_hash));

      if (!passwordMatches) {
        return response.status(401).json({ error: "Invalid email or password" });
      }
      if (parsed.data.role && parsed.data.role !== user.role) {
        return response.status(403).json({ error: "Selected account type does not match this account" });
      }

      const accessToken = createAccessToken(
        user.user_id,
        user.refresh_token_version,
      );
      const refreshToken = createRefreshToken(
        user.user_id,
        user.refresh_token_version,
      );
      setRefreshCookie(response, refreshToken);

      return response.status(200).json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 900,
        user: toUserProfile(user),
      });
    } catch (error) {
      return sendServerError(response, error);
    }
  });

  router.post("/logout", async (request, response) => {
    if (hasUnexpectedOrigin(request, response)) return;
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      clearRefreshCookie(response);
      return response.status(204).end();
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      clearRefreshCookie(response);
      if (isConfigurationError(error)) {
        return sendServerError(response, error);
      }
      return response.status(204).end();
    }

    try {
      const { error } = await supabaseClientProvider()
        .from("users")
        .update({ refresh_token_version: payload.token_version + 1 })
        .eq("user_id", payload.sub)
        .eq("refresh_token_version", payload.token_version);

      clearRefreshCookie(response);
      if (error) {
        logDatabaseError("logout revocation", error);
        return response.status(503).json({ error: "Logout is unavailable" });
      }

      return response.status(204).end();
    } catch (error) {
      clearRefreshCookie(response);
      return sendServerError(response, error);
    }
  });

  router.post("/refresh-token", async (request, response) => {
    if (hasUnexpectedOrigin(request, response)) return;
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return response.status(401).json({ error: "Invalid or expired refresh token" });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      if (isConfigurationError(error)) {
        return sendServerError(response, error);
      }
      clearRefreshCookie(response);
      return response.status(401).json({ error: "Invalid or expired refresh token" });
    }

    try {
      getJwtSecrets();
      const supabase = supabaseClientProvider();
      const { data: user, error } = await supabase
        .from("users")
        .select(`${USER_PROFILE_COLUMNS},refresh_token_version`)
        .eq("user_id", payload.sub)
        .maybeSingle();

      if (error) {
        logDatabaseError("refresh lookup", error);
        return response.status(503).json({ error: "Token refresh is unavailable" });
      }

      if (!user || !user.is_active) {
        clearRefreshCookie(response);
        return response.status(401).json({ error: "Invalid or expired refresh token" });
      }

      if (user.refresh_token_version !== payload.token_version) {
        clearRefreshCookie(response);
        return response.status(401).json({ error: "Invalid or expired refresh token" });
      }

      const nextTokenVersion = user.refresh_token_version + 1;
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ refresh_token_version: nextTokenVersion })
        .eq("user_id", user.user_id)
        .eq("refresh_token_version", payload.token_version)
        .select(`${USER_PROFILE_COLUMNS},refresh_token_version`)
        .maybeSingle();

      if (updateError) {
        logDatabaseError("refresh rotation", updateError);
        return response.status(503).json({ error: "Token refresh is unavailable" });
      }

      if (!updatedUser) {
        clearRefreshCookie(response);
        return response.status(401).json({ error: "Invalid or expired refresh token" });
      }

      setRefreshCookie(
        response,
        createRefreshToken(updatedUser.user_id, updatedUser.refresh_token_version),
      );

      return response.status(200).json({
        access_token: createAccessToken(
          updatedUser.user_id,
          updatedUser.refresh_token_version,
        ),
        token_type: "Bearer",
        expires_in: 900,
        user: toUserProfile(updatedUser),
      });
    } catch (error) {
      return sendServerError(response, error);
    }
  });

  return router;
}

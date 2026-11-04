import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { getSupabaseClient } from "./config/supabase.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createDepartmentsRouter } from "./routes/departments.routes.js";
import { createCoursesRouter } from "./routes/courses.routes.js";
import { createUsersRouter } from "./routes/users.routes.js";

export function createApp({
  supabaseClientProvider = getSupabaseClient,
} = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";
  const configuredClientUrl = process.env.CLIENT_URL;
  if (isProduction && !configuredClientUrl) {
    throw new Error("CLIENT_URL must be configured in production");
  }

  let clientOrigin;
  try {
    clientOrigin = new URL(
      configuredClientUrl || "http://localhost:5173",
    ).origin;
  } catch {
    throw new Error("CLIENT_URL must be a valid frontend origin");
  }

  if (isProduction && !clientOrigin.startsWith("https://")) {
    throw new Error("CLIENT_URL must use HTTPS in production");
  }

  const isDevelopmentOrigin = (origin) => {
    if (isProduction) return false;
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

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(
          null,
          !origin || origin === clientOrigin || isDevelopmentOrigin(origin),
        );
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.use("/api", apiLimiter);
  app.use(
    "/api/auth",
    createAuthRouter({ supabaseClientProvider }),
  );
  app.use(
    "/api/departments",
    createDepartmentsRouter({ supabaseClientProvider }),
  );
  app.use("/api/courses", createCoursesRouter({ supabaseClientProvider }));
  app.use("/api/users", createUsersRouter({ supabaseClientProvider }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({ status: "ok", message: "API is healthy" });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found" });
  });

  app.use((error, _request, response, _next) => {
    const status =
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;

    if (status >= 500) {
      console.error("Unhandled request error:", error.name || "Error");
    }

    response
      .status(status)
      .json({
        error: status < 500 ? "Invalid request" : "Internal server error",
      });
  });

  return app;
}

const app = createApp();

export default app;

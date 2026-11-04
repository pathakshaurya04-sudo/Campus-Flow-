import {
  toUserProfile,
  USER_PROFILE_COLUMNS,
} from "../auth/user-profile.js";
import { verifyAccessToken } from "../auth/tokens.js";

function isConfigurationError(error) {
  return error?.name === "ConfigurationError";
}

export function createAuthMiddleware(supabaseClientProvider) {
  return async function authenticate(request, response, next) {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

    if (!match) {
      return response.status(401).json({ error: "Authentication required" });
    }

    let payload;
    try {
      payload = verifyAccessToken(match[1]);
    } catch (error) {
      if (isConfigurationError(error)) {
        return response.status(503).json({ error: "Authentication is not configured" });
      }
      return response.status(401).json({ error: "Invalid or expired access token" });
    }

    try {
      const supabase = supabaseClientProvider();
      const { data: user, error } = await supabase
        .from("users")
        .select(`${USER_PROFILE_COLUMNS},refresh_token_version`)
        .eq("user_id", payload.sub)
        .maybeSingle();

      if (error) {
        console.error("Authentication user lookup failed:", error.code || "UNKNOWN");
        return response.status(503).json({ error: "Authentication is unavailable" });
      }

      if (!user || !user.is_active) {
        return response.status(401).json({ error: "Invalid or expired access token" });
      }
      if (user.refresh_token_version !== payload.token_version) {
        return response.status(401).json({ error: "Invalid or expired access token" });
      }

      request.auth = toUserProfile(user);
      return next();
    } catch (error) {
      if (isConfigurationError(error)) {
        return response.status(503).json({ error: "Authentication is not configured" });
      }
      console.error("Authentication middleware failed:", error?.name || "Error");
      return response.status(500).json({ error: "Internal server error" });
    }
  };
}

export function requireRole(...allowedRoles) {
  return function authorizeRole(request, response, next) {
    if (!request.auth) {
      return response.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(request.auth.role)) {
      return response.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}

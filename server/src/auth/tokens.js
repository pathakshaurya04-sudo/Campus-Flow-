import jwt from "jsonwebtoken";

const ISSUER = "department-management-system";
const AUDIENCE = "department-management-system-client";

export function getJwtSecrets() {
  const { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } = process.env;

  if (
    !JWT_ACCESS_SECRET ||
    !JWT_REFRESH_SECRET ||
    JWT_ACCESS_SECRET.length < 32 ||
    JWT_REFRESH_SECRET.length < 32 ||
    JWT_ACCESS_SECRET === JWT_REFRESH_SECRET
  ) {
    const error = new Error("JWT secrets are missing or invalid");
    error.name = "ConfigurationError";
    throw error;
  }

  return { accessSecret: JWT_ACCESS_SECRET, refreshSecret: JWT_REFRESH_SECRET };
}

export function createAccessToken(userId, tokenVersion = 0) {
  const { accessSecret } = getJwtSecrets();
  return jwt.sign({ token_use: "access", token_version: tokenVersion }, accessSecret, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: "15m",
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function createRefreshToken(userId, tokenVersion) {
  const { refreshSecret } = getJwtSecrets();
  return jwt.sign({ token_use: "refresh", token_version: tokenVersion }, refreshSecret, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: "7d",
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token) {
  const { accessSecret } = getJwtSecrets();
  const payload = jwt.verify(token, accessSecret, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (
    typeof payload === "string" ||
    payload.token_use !== "access" ||
    typeof payload.sub !== "string" ||
    !Number.isInteger(payload.token_version) ||
    payload.token_version < 0
  ) {
    throw new jwt.JsonWebTokenError("Invalid access token");
  }

  return payload;
}

export function verifyRefreshToken(token) {
  const { refreshSecret } = getJwtSecrets();
  const payload = jwt.verify(token, refreshSecret, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (
    typeof payload === "string" ||
    payload.token_use !== "refresh" ||
    typeof payload.sub !== "string" ||
    !Number.isInteger(payload.token_version) ||
    payload.token_version < 0
  ) {
    throw new jwt.JsonWebTokenError("Invalid refresh token");
  }

  return payload;
}

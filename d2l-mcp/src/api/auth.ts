/**
 * REST API auth middleware.
 * - Cognito: verify JWT, set req.userId = payload.sub.
 * - Dev bypass: SKIP_JWT_AUTH=1 + X-User-Id header.
 */

import type { Request, Response, NextFunction } from "express";

const SKIP = process.env.SKIP_JWT_AUTH === "1" || process.env.SKIP_JWT_AUTH === "true";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

let verifier: { verify: (token: string) => Promise<{ sub: string }> } | null = null;

async function initVerifier() {
  if (verifier) return verifier;
  if (!USER_POOL_ID || !CLIENT_ID) return null;
  const { CognitoJwtVerifier } = await import("aws-jwt-verify");
  verifier = CognitoJwtVerifier.create({
    userPoolId: USER_POOL_ID,
    tokenUse: "id",
    clientId: CLIENT_ID,
  }) as unknown as { verify: (token: string) => Promise<{ sub: string }> };
  return verifier;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (SKIP) {
    const uid = req.headers["x-user-id"] as string | undefined;
    req.userId = uid?.trim() || "dev-user";
    next();
    return;
  }

  const auth = req.headers["authorization"] || req.headers["Authorization"];
  const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const v = await initVerifier();
  if (!v) {
    res.status(503).json({ error: "JWT verification not configured (COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID)" });
    return;
  }

  try {
    const payload = await v.verify(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

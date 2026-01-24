/**
 * User context for multi-tenant scoping.
 * - MCP: use MCP_USER_ID env var (or 'legacy' for existing single-tenant).
 * - REST API: middleware sets req.userId from JWT sub.
 */

export function getUserId(): string {
  return process.env.MCP_USER_ID ?? "legacy";
}

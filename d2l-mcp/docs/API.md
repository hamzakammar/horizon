# REST API (app-first MVP)

When `MCP_TRANSPORT=http|https`, the server exposes REST endpoints for the mobile app.

## Base URL

- `http://localhost:3000` (or `MCP_PORT`)
- `GET /health` — no auth, returns `{ ok: true }` for load balancers.

## Auth

All `/api/*` routes require auth.

- **Cognito**: `Authorization: Bearer <id_token>`. Set `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`. `req.userId` = token `sub`.
- **Dev bypass**: `SKIP_JWT_AUTH=1` and `X-User-Id: <id>` header. Use only for local development.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/notes/presign-upload` | Get presigned S3 PUT URL for PDF upload |
| `POST` | `/api/notes/process` | Process uploaded PDF (extract, chunk, embed) |
| `GET` | `/api/notes` | List user's notes (optional `?courseId=`) |
| `GET` | `/api/search` | Semantic search (`?q=`, `?courseId=`, `?limit=`) |
| `GET` | `/api/dashboard` | Dashboard summary (recent notes, usage, stats) |

### Presign upload

- **Body**: `{ "filename": "a.pdf", "contentType": "application/pdf", "size": 12345, "courseId": "MATH119" }`
- **Response**: `{ "uploadUrl": "https://...", "s3Key": "users/{userId}/notes/..." }`
- App uploads file with `PUT` to `uploadUrl`, then calls `/api/notes/process` with `s3Key`.

### Process

- **Body**: `{ "s3Key": "users/.../notes/...", "courseId": "MATH119", "title": "Lecture 1" }`
- **Response**: `{ "noteId": "uuid", "status": "ready", "chunkCount": 12, "pageCount": 5, "embedded": 12 }`

### Search

- **Query**: `q` (required), `courseId`, `limit` (default 10, max 50)
- **Response**: `{ "hits": [ { "sectionId", "noteId", "title", "snippet", "url", "anchor", "score" } ] }`

### Dashboard

- **Response**: `{ "recentNotes": [...], "usage": { "totalChunks": 42 }, "stats": { "notesCount": 7 } }`

## Env (API)

- `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` — JWT verification.
- `SKIP_JWT_AUTH=1` — dev bypass; use `X-User-Id`.
- `AWS_REGION`, `S3_BUCKET` — presign + process. Optional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for local.
- `OPENAI_API_KEY` — embeddings for search + process.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` — DB.

## MCP multi-user

- Set `MCP_USER_ID` when running as MCP (e.g. power users). All study tools scope by this user. Default `legacy` if unset.

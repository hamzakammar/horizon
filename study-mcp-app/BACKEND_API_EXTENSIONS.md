# Backend API Extensions Needed

The mobile app needs these additional REST API endpoints to access full MCP functionality.

## D2L Integration Endpoints

### GET /api/d2l/status
Get D2L connection status and last sync time.

**Response:**
```json
{
  "connected": true,
  "lastSync": "2026-01-25T18:00:00Z",
  "coursesCount": 5
}
```

### POST /api/d2l/connect
Connect to D2L. This could:
- Trigger OAuth flow (return redirect URL)
- Accept credentials (username/password) - less secure
- Use existing session if available

**Request (credentials approach):**
```json
{
  "username": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "connected": true,
  "message": "Connected successfully"
}
```

### POST /api/d2l/sync
Trigger full D2L sync (equivalent to `sync_all` MCP tool).

**Response:**
```json
{
  "status": "started",
  "message": "Sync initiated"
}
```

### GET /api/d2l/courses
Get list of enrolled courses.

**Response:**
```json
{
  "courses": [
    {
      "id": "course-id",
      "name": "MATH 119",
      "code": "MATH119",
      "semester": "Fall 2025"
    }
  ]
}
```

### GET /api/d2l/courses/:courseId/assignments
Get assignments for a specific course.

**Response:**
```json
{
  "assignments": [
    {
      "id": "assignment-id",
      "title": "Homework 1",
      "dueDate": "2026-02-01T23:59:59Z",
      "status": "submitted"
    }
  ]
}
```

## Piazza Integration Endpoints

### GET /api/piazza/status
Get Piazza connection status.

**Response:**
```json
{
  "connected": true,
  "lastSync": "2026-01-25T18:00:00Z",
  "classesCount": 3
}
```

### POST /api/piazza/connect
Connect to Piazza (credentials or OAuth).

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

### POST /api/piazza/sync
Trigger Piazza sync (equivalent to `piazza_sync` MCP tool).

**Response:**
```json
{
  "status": "started",
  "message": "Piazza sync initiated"
}
```

### POST /api/piazza/embed-missing
Embed missing Piazza posts (equivalent to `piazza_embed_missing` MCP tool).

**Response:**
```json
{
  "status": "started",
  "message": "Embedding process started"
}
```

### GET /api/piazza/search
Search Piazza posts (equivalent to `piazza_semantic_search` MCP tool).

**Query params:**
- `q` (required): Search query
- `courseId` (optional): Filter by course
- `limit` (optional, default 10): Max results

**Response:**
```json
{
  "hits": [
    {
      "postId": "post-id",
      "title": "Question about...",
      "snippet": "...",
      "score": 0.95,
      "url": "https://piazza.com/..."
    }
  ]
}
```

## Notes Endpoints (Extensions)

### POST /api/notes/embed-missing
Embed missing note sections (equivalent to `notes_embed_missing` MCP tool).

**Response:**
```json
{
  "status": "started",
  "message": "Embedding process started"
}
```

## Implementation Notes

1. **Authentication**: All endpoints use the existing `authMiddleware` (Cognito JWT)
2. **User Context**: All operations are scoped to `req.userId` from the JWT token
3. **MCP Tools**: These endpoints should call the existing MCP tool handlers internally
4. **Error Handling**: Return appropriate HTTP status codes and error messages
5. **Async Operations**: Long-running operations (sync, embed) should return immediately with status, or use webhooks/websockets for progress updates

## Example Implementation Pattern

```typescript
// In routes.ts
router.post("/d2l/sync", async (req: Request, res: Response) => {
  const userId = req.userId!;
  
  // Call the MCP tool handler
  const syncTools = SyncTools.sync_all;
  const result = await syncTools.handler({
    userId, // Pass user context
    // ... other params
  });
  
  res.json({ status: "completed", result });
});
```

## Priority

1. **High Priority**: `/api/d2l/sync`, `/api/piazza/sync`, `/api/notes/embed-missing`
2. **Medium Priority**: Status endpoints, search endpoints
3. **Low Priority**: Individual course/assignment endpoints (can be added later)

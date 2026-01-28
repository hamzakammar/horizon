# Testing Checklist for D2L Authentication Refactor

## Pre-Deployment Checks

- [x] TypeScript builds successfully
- [ ] All linter errors resolved
- [ ] Code changes reviewed

## Deployment Steps

1. **Build and Deploy Backend**
   ```bash
   cd d2l-mcp
   ./scripts/deploy-to-ecs.sh
   ```

2. **Monitor Deployment**
   ```bash
   aws ecs describe-services --cluster study-mcp-cluster --services study-mcp-backend --region us-east-1
   ```

3. **Check Logs**
   ```bash
   aws logs tail /ecs/study-mcp-backend --follow --region us-east-1
   ```

## Mobile App Testing

### Test 1: WebView Login Flow
- [ ] Open mobile app
- [ ] Navigate to Settings → Connect D2L
- [ ] Verify only "WebView Login" option is shown (no credentials tab)
- [ ] Enter D2L host (e.g., `learn.uwaterloo.ca`)
- [ ] Tap "Sign in with WebView"
- [ ] Complete login in WebView (including 2FA if required)
- [ ] Verify cookies are automatically captured
- [ ] Verify automatic navigation back to previous screen
- [ ] Verify success message or smooth transition

### Test 2: Cookie Extraction
- [ ] Open browser DevTools (if possible) or check logs
- [ ] Verify only `d2lSessionVal` and `d2lSecureSessionVal` cookies are extracted
- [ ] Verify no other cookies are included in the cookie string

### Test 3: Backend Session Storage
- [ ] After successful WebView login, check Supabase `user_credentials` table
- [ ] Verify `token` field contains cookie string with both required cookies
- [ ] Verify `host` field is correctly set
- [ ] Verify `updated_at` timestamp is recent

### Test 4: API Endpoint Verification
- [ ] Test `/api/d2l/status` endpoint
- [ ] Verify `connected: true` and `reauthRequired: false` for fresh session
- [ ] Test `/api/d2l/courses` endpoint
- [ ] Verify courses are returned successfully
- [ ] Test `/api/d2l/courses/:courseId/announcements` endpoint
- [ ] Verify announcements are returned successfully

### Test 5: Production Mode Behavior
- [ ] Verify backend is running with `NODE_ENV=production`
- [ ] Attempt to use an expired session (older than 20 hours)
- [ ] Verify API returns `reauthRequired: true` in status endpoint
- [ ] Verify API endpoints return `401` with `REAUTH_REQUIRED` error for expired sessions
- [ ] Verify backend does NOT attempt to launch a headed browser

### Test 6: Token Refresh Logic
- [ ] Wait for session to age (or manually update `updated_at` in database to >20 hours ago)
- [ ] Call `/api/d2l/status`
- [ ] Verify `reauthRequired: true` is returned
- [ ] Verify mobile app prompts for re-authentication

### Test 7: Error Handling
- [ ] Test with invalid cookies
- [ ] Verify appropriate error messages
- [ ] Test with missing cookies
- [ ] Verify graceful error handling

## Backend Log Checks

Monitor logs for these key indicators:

- [ ] `[AUTH] Production mode: No valid token found for user X, throwing REAUTH_REQUIRED` (when appropriate)
- [ ] `[AUTH] Using stored token for user X` (when using valid session)
- [ ] `[AUTH] Browser launched (headless: true, ...)` (always headless in production)
- [ ] `[API] Cookies stored, verifying...` (when mobile app sends cookies)
- [ ] `[API] Cookies verified successfully` (after successful verification)

## Expected Behavior Summary

### ✅ Success Cases
1. User logs in via WebView → Cookies captured → Stored in DB → Backend uses cookies → API calls succeed
2. User has valid session (<20 hours old) → Backend uses stored cookies → API calls succeed
3. User's session expires (>20 hours) → Backend throws REAUTH_REQUIRED → Mobile app prompts re-login

### ❌ Failure Cases (Should NOT Happen)
1. Backend attempts to launch headed browser in production
2. Backend tries automated login with credentials in production
3. Backend crashes or hangs on login screen
4. Mobile app shows credentials tab in production

## Rollback Plan

If issues occur:
1. Revert to previous Docker image tag
2. Or redeploy previous version:
   ```bash
   aws ecs update-service \
     --cluster study-mcp-cluster \
     --service study-mcp-backend \
     --force-new-deployment \
     --region us-east-1
   ```

## Post-Deployment Verification

- [ ] All tests pass
- [ ] No errors in CloudWatch logs
- [ ] Mobile app can successfully connect to D2L
- [ ] API endpoints respond correctly
- [ ] No headed browser launch attempts in production logs

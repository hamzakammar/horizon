# Troubleshooting Cognito Authentication

## "Unable to verify secret hash" Error

This error means Cognito cannot verify the SECRET_HASH you're sending. Common causes:

### 1. **Client Secret Mismatch**
- The `EXPO_PUBLIC_COGNITO_CLIENT_SECRET` must match the secret for the App Client ID you're using
- Verify in AWS Console: Cognito → User Pools → Your Pool → App integration → App clients
- Make sure you're copying the **entire** secret (no extra spaces or newlines)

### 2. **Client ID Mismatch**
- The `EXPO_PUBLIC_COGNITO_CLIENT_ID` must match the App Client that has the secret
- Each App Client has its own secret - they must match

### 3. **Environment Variable Not Loaded**
- Restart Expo after setting environment variables: `npm start`
- Check that variables are prefixed with `EXPO_PUBLIC_`
- Verify in your `.env` file or `app.config.js`

### 4. **Whitespace Issues**
- Make sure there are no extra spaces in your environment variables
- The code now trims values automatically, but double-check your `.env` file

## How to Verify Your Configuration

1. **Check AWS Console:**
   ```
   Cognito → User Pools → [Your Pool] → App integration → App clients
   ```
   - Note the **Client ID**
   - Click on the client → **Show client secret** (if it exists)
   - Copy both values exactly

2. **Verify Environment Variables:**
   ```bash
   # In your .env file or app.config.js
   EXPO_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
   EXPO_PUBLIC_COGNITO_CLIENT_ID=28vbrb3te89n4mrrk1jg1qv4fh
   EXPO_PUBLIC_COGNITO_CLIENT_SECRET=your-secret-here
   EXPO_PUBLIC_COGNITO_REGION=us-east-1
   ```

3. **Test the Configuration:**
   - Restart Expo: `npm start`
   - Check console logs for warnings about Cognito configuration
   - Try signing up again

## Alternative: Create App Client Without Secret

If you continue having issues, you can create a new App Client **without** a client secret:

1. Go to Cognito → User Pools → Your Pool → App integration → App clients
2. Click **Create app client**
3. **Uncheck** "Generate client secret"
4. Enable **ALLOW_USER_PASSWORD_AUTH**
5. Save and use the new Client ID

Then remove `EXPO_PUBLIC_COGNITO_CLIENT_SECRET` from your environment variables.

## Debug Mode

The app logs debug information in development mode. Check your console for:
- `[Auth] Computed SECRET_HASH for username: ...`
- `[Auth] SignUp with SECRET_HASH - ClientId: ...`

If you see these logs, the SECRET_HASH is being computed. If you still get the error, the issue is likely:
- Wrong client secret value
- Client ID and secret don't match
- Region mismatch

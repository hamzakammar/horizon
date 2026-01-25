# Cognito Authentication Setup

## ✅ What's Implemented

1. **Cognito Authentication Service** (`src/services/auth.ts`)
   - Login with email/password
   - Sign up with email/password
   - Email verification support
   - JWT token parsing and storage
   - Automatic token refresh handling
   - Logout functionality

2. **Cognito Configuration** (`src/config/cognito.ts`)
   - User Pool configuration
   - Environment variable support

## 🔧 Configuration Required

### 1. Set Environment Variables

Create a `.env` file in the `study-mcp-app` directory (or use Expo's app.config.js):

```env
EXPO_PUBLIC_COGNITO_USER_POOL_ID=your-user-pool-id-here
EXPO_PUBLIC_COGNITO_CLIENT_ID=your-client-id-here
EXPO_PUBLIC_COGNITO_CLIENT_SECRET=your-client-secret-here
EXPO_PUBLIC_COGNITO_REGION=us-east-1
EXPO_PUBLIC_API_BASE_URL=https://api.hamzaammar.ca
```

**Note:** If your Cognito App Client has a client secret, you **must** set `EXPO_PUBLIC_COGNITO_CLIENT_SECRET`. The app will automatically compute and include SECRET_HASH in all requests.

**OR** update `src/config/cognito.ts` directly with your values.

### 2. Get Your Cognito Values

1. Go to AWS Console → Cognito → User Pools
2. Select your User Pool (or create one)
3. Copy the **User Pool ID**
4. Go to **App integration** → **App clients**
5. Copy the **Client ID**

### 3. Configure Cognito User Pool

Make sure your Cognito User Pool is configured for:
- **Email as username** (or allow email sign-in)
- **Email verification** (if you want email verification)
- **Password policy** (minimum length, complexity, etc.)

### 4. App Client Settings

In Cognito → App clients → Your app client:
- Enable **ALLOW_USER_PASSWORD_AUTH** (for username/password auth)
- Set **Callback URLs** if using hosted UI (optional)
- Set **Sign out URLs** if using hosted UI (optional)

## 🧪 Testing

### Test Sign Up
1. Open the app
2. Tap "Sign Up"
3. Enter email and password
4. If email verification is enabled, you'll need to verify your email first
5. Then sign in

### Test Sign In
1. Enter your email and password
2. Should authenticate and navigate to Dashboard

## 📝 Additional Features Available

The auth service also includes:
- `confirmSignUp(email, code)` - Confirm email with verification code
- `resendConfirmationCode(email)` - Resend verification code

You can add a verification screen to your app if needed.

## 🐛 Troubleshooting

### "Cognito not configured" warning
- Make sure environment variables are set
- Restart Expo after setting environment variables

### "Authentication failed"
- Check your User Pool ID and Client ID are correct
- Verify the user exists in Cognito
- Check password meets requirements

### "UserNotConfirmedException"
- User needs to verify their email first
- Implement email verification flow

### Token issues
- Tokens are stored securely in Expo SecureStore
- Tokens are automatically added to API requests
- 401 errors will automatically log the user out

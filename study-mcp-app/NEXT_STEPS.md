# Next Steps for Study MCP App

## ✅ Completed
- Skeleton app structure with navigation
- All screens (Dashboard, Notes, Search, Upload)
- API services and types
- Auth context and service structure
- Dependencies installed

## 🔧 Immediate Next Steps

### 1. **Test the App (Quick Check)**
```bash
cd study-mcp-app
npm start
```
This will verify the app runs without errors. You'll see the login screen (auth not working yet).

### 2. **Implement Cognito Authentication**

The backend expects AWS Cognito ID tokens. You need to:

**Option A: Use AWS Amplify (Recommended)**
```bash
npm install aws-amplify @aws-amplify/react-native
npx expo install @react-native-async-storage/async-storage
```

**Option B: Use amazon-cognito-identity-js (Lighter weight)**
```bash
npm install amazon-cognito-identity-js
```

Then implement in `src/services/auth.ts`:
- Configure Cognito User Pool ID and Client ID
- Implement `login()` using Cognito SDK
- Implement `signUp()` using Cognito SDK
- Handle token refresh

### 3. **Environment Configuration**

Create `.env` file (or use Expo config):
```env
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
API_BASE_URL=https://api.hamzaammar.ca
# or for dev:
# API_BASE_URL=http://localhost:3000
```

### 4. **Test API Connection**

Once auth is working:
- Test login/signup flow
- Verify token is sent in API requests
- Test dashboard endpoint
- Test notes listing

### 5. **Development Mode (Quick Testing)**

For local development, you can temporarily use the dev bypass:
- Set `SKIP_JWT_AUTH=1` on backend
- Send `X-User-Id` header instead of Bearer token
- This lets you test the app without Cognito setup

## 📝 Files to Update

1. **`src/services/auth.ts`** - Implement Cognito login/signup
2. **`src/config/api.ts`** - Add environment variable support
3. **`app.json`** - Add any required Expo config plugins

## 🎨 UI/UX Improvements (Later)

- Add loading states
- Add error handling UI
- Add pull-to-refresh
- Add note detail view
- Add search result detail view
- Add course filtering
- Add icons to tab navigator

## 🚀 Deployment Prep (Later)

- Configure app.json for production
- Set up app icons and splash screens
- Configure deep linking
- Set up app store accounts
- Configure build settings

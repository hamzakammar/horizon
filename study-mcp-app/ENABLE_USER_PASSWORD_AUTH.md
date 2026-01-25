# Enable USER_PASSWORD_AUTH in Cognito

## The Issue

You're getting the error: `"USER_PASSWORD_AUTH flow not enabled for this client"`

This means your Cognito App Client doesn't have the `USER_PASSWORD_AUTH` authentication flow enabled.

## Solution: Enable USER_PASSWORD_AUTH

### Step 1: Go to AWS Console
1. Navigate to **AWS Cognito** → **User Pools**
2. Select your User Pool
3. Go to **App integration** tab
4. Click on **App clients and analytics**
5. Find your App Client (the one with Client ID: `28vbrb3te89n4mrrk1jg1qv4fh`)
6. Click on the App Client to edit it

### Step 2: Enable Authentication Flows
1. Scroll down to **Authentication flows configuration**
2. Check the box for **ALLOW_USER_PASSWORD_AUTH**
3. Click **Save changes**

### Step 3: Restart Your App
After enabling, restart your Expo app:
```bash
# Stop the current server (Ctrl+C)
npm start
```

## Alternative: Use SRP Flow (More Secure)

If you prefer not to enable USER_PASSWORD_AUTH (it's less secure), you can:

1. **Remove the client secret** - Create a new App Client without a client secret
2. **Use the library's SRP flow** - The `amazon-cognito-identity-js` library uses SRP by default, which is more secure

However, if you keep the client secret, you'll need USER_PASSWORD_AUTH enabled for the direct API calls to work.

## Why This Happens

- `USER_PASSWORD_AUTH` allows direct username/password authentication
- It's disabled by default for security reasons (SRP is preferred)
- Mobile apps often enable it for simplicity
- When using client secrets with direct API calls, it's required

## Security Note

`USER_PASSWORD_AUTH` is less secure than SRP because:
- Password is sent over the network (though still encrypted via HTTPS)
- SRP never sends the password, only cryptographic proofs

For production apps, consider:
- Using SRP (remove client secret, use library method)
- Or ensure strong HTTPS/TLS
- Or use AWS Amplify which handles this automatically

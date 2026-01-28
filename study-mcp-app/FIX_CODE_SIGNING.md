# Fix Code Signing Issue

## Problem
Build fails with: "No profiles for 'com.studymcp.app' were found"

## Quick Fix (Recommended)

### Option 1: Enable Automatic Signing in Xcode

1. **Open Xcode workspace:**
   ```bash
   open ios/studymcpapp.xcworkspace
   ```

2. **In Xcode:**
   - Click on the project "studymcpapp" in the left sidebar
   - Select the "studymcpapp" target
   - Go to "Signing & Capabilities" tab
   - Check ✅ "Automatically manage signing"
   - Select your Team (should show your Apple ID)
   - Xcode will automatically create/update the provisioning profile

3. **Build again:**
   ```bash
   npx expo run:ios --device "Hamza (2)"
   ```

### Option 2: Use a Different Bundle Identifier

If you have another app with a working bundle ID, you can use that:

1. **Update app.json:**
   ```json
   "ios": {
     "bundleIdentifier": "com.yourname.yourapp"
   }
   ```

2. **Regenerate native code:**
   ```bash
   npx expo prebuild --clean
   ```

3. **Build:**
   ```bash
   npx expo run:ios --device
   ```

### Option 3: Use Your Apple Developer Account Bundle ID

If you have an Apple Developer account, use a bundle ID that matches:

1. **Update app.json with your existing bundle ID:**
   ```json
   "ios": {
     "bundleIdentifier": "com.yourdomain.appname"
   }
   ```

2. **Regenerate and build:**
   ```bash
   npx expo prebuild --clean
   npx expo run:ios --device
   ```

## Most Common Solution

**Just open Xcode and enable automatic signing** - it's the easiest:
```bash
open ios/studymcpapp.xcworkspace
```

Then in Xcode: Project → Target → Signing & Capabilities → Enable "Automatically manage signing"

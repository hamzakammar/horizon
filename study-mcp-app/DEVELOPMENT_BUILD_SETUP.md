# Development Build Setup for @react-native-cookies/cookies

## Why This is Needed

`@react-native-cookies/cookies` requires native code that **cannot run in Expo Go**. You need to create a **custom development build** that includes the native module.

## ✅ Physical Device Support

**Yes, this will work on a physical device!** In fact, it's the recommended way to test native modules.

## Setup Steps

### 1. Install Dependencies (Already Done ✅)
```bash
npx expo install expo-dev-client
npm install @react-native-cookies/cookies
```

### 2. Create Development Build

#### For iOS (Physical Device):
```bash
# Build for iOS device
npx expo run:ios --device

# OR use EAS Build (recommended for physical devices)
eas build --profile development --platform ios
```

#### For Android (Physical Device):
```bash
# Build for Android device
npx expo run:android --device

# OR use EAS Build (recommended for physical devices)
eas build --profile development --platform android
```

### 3. Install on Physical Device

#### iOS:
1. Build will create an `.ipa` file
2. Install via Xcode, TestFlight, or direct install
3. Or use `npx expo run:ios --device` which installs automatically

#### Android:
1. Build will create an `.apk` or `.aab` file
2. Transfer to device and install
3. Or use `npx expo run:android --device` which installs automatically

### 4. Start Development Server

After installing the development build on your device:

```bash
npx expo start --dev-client
```

This starts the Metro bundler. The development build on your device will connect to it.

## Using EAS Build (Recommended for Physical Devices)

### 1. Install EAS CLI
```bash
npm install -g eas-cli
eas login
```

### 2. Configure EAS
```bash
eas build:configure
```

### 3. Build Development Client
```bash
# For iOS
eas build --profile development --platform ios

# For Android  
eas build --profile development --platform android
```

### 4. Install on Device
- iOS: Download from EAS build page or TestFlight
- Android: Download `.apk` and install directly

## Testing on Physical Device

1. **Install the development build** on your physical device
2. **Start the dev server**: `npx expo start --dev-client`
3. **Open the app** on your device
4. **Test the cookie capture** - it should work now!

## Troubleshooting

### "Module not found" errors
- Make sure you ran `npx expo prebuild` after adding the package
- Rebuild the development client

### Build fails
- Make sure you have Xcode (iOS) or Android Studio (Android) installed
- Check that all dependencies are installed

### App crashes on launch
- Check device logs: `npx expo start --dev-client` shows logs
- Make sure the development build matches your Expo SDK version

## Quick Start (Local Build)

```bash
# iOS
npx expo run:ios --device

# Android
npx expo run:android --device
```

This will:
1. Generate native code
2. Build the app
3. Install on connected device
4. Start Metro bundler

## Notes

- **Development builds are different from Expo Go** - they include your custom native code
- **You need to rebuild** when you add new native modules
- **Physical devices work perfectly** - actually recommended for testing native modules
- The development build includes the native cookie manager code

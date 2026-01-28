# Troubleshooting Physical Device Detection

## Issue: Can't Select Physical Device, Resorts to Simulator

### Step 1: Verify Device Connection

**For iOS:**
```bash
# Check if device is detected
xcrun xctrace list devices

# Look for your device name (NOT "Simulator")
# Should show something like:
# Your iPhone (iOS 17.x) (UDID)
```

**For Android:**
```bash
# Check if device is detected
adb devices

# Should show:
# List of devices attached
# ABC123XYZ    device
```

### Step 2: iOS Device Setup

1. **Connect via USB** - Make sure cable is data-capable (not just charging)
2. **Trust Computer** - On your iPhone/iPad:
   - Unlock device
   - When prompted "Trust This Computer?" → Tap "Trust"
   - Enter passcode if asked
3. **Enable Developer Mode** (iOS 16+):
   - Settings → Privacy & Security → Developer Mode → Enable
   - Restart device when prompted
4. **Check Xcode**:
   - Open Xcode
   - Window → Devices and Simulators
   - Your device should appear here
   - If it shows "This device is not trusted", click "Trust"

### Step 3: Force Device Selection

**Option A: Specify Device by Name**
```bash
# List all devices first
xcrun xctrace list devices

# Then use the exact device name
npx expo run:ios --device "Your iPhone Name"
```

**Option B: Use Device UDID**
```bash
# Get device UDID
xcrun xctrace list devices | grep -v Simulator

# Use UDID
npx expo run:ios --device <UDID>
```

**Option C: Use Xcode Directly**
```bash
# Open Xcode workspace
open ios/studymcpapp.xcworkspace

# In Xcode:
# 1. Select your device from the device dropdown (top bar)
# 2. Click Run (▶️) button
```

### Step 4: Android Device Setup

1. **Enable USB Debugging**:
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable "USB Debugging"
2. **Authorize Computer**:
   - Connect device via USB
   - On device, tap "Allow USB Debugging" → Check "Always allow" → OK
3. **Verify Connection**:
   ```bash
   adb devices
   # Should show your device
   ```

### Step 5: Alternative - Build and Install Manually

**iOS:**
```bash
# Build the app
npx expo run:ios --configuration Release

# Then install via Xcode:
# 1. Open ios/studymcpapp.xcworkspace in Xcode
# 2. Select your device
# 3. Product → Run (or Cmd+R)
```

**Android:**
```bash
# Build APK
cd android
./gradlew assembleDebug

# Install on device
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Step 6: Use EAS Build (Cloud Build)

If local builds are problematic, use EAS Build:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Build for device
eas build --profile development --platform ios --local
# or
eas build --profile development --platform android --local
```

### Common Issues

**"No devices found"**
- Device not connected via USB
- Device not trusted
- USB cable is charge-only
- Developer mode not enabled (iOS 16+)

**"Device not trusted"**
- Unlock device
- Tap "Trust" when prompted
- Check Xcode → Devices and Simulators

**"Unknown platform"**
- Update Expo CLI: `npm install -g @expo/cli@latest`
- Update Xcode to latest version

**Device appears but can't select**
- Try specifying device name explicitly
- Use Xcode directly instead of CLI
- Check device iOS version compatibility

### Quick Test

```bash
# iOS - List devices with details
xcrun devicectl list devices

# Android - List devices
adb devices -l
```

If your device doesn't appear in these lists, it's a connection/trust issue, not an Expo issue.

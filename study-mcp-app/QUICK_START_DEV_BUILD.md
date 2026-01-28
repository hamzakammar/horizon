# Quick Start: Build for Physical Device

## ✅ Prebuild Complete!

The native code has been generated and `react-native-cookies` is linked. Now build for your physical device.

## Build Commands

### For iOS Physical Device:

```bash
# This will build and install on your connected iPhone/iPad
npx expo run:ios --device

# OR if you want to specify a device:
npx expo run:ios --device "Your Device Name"
```

**Requirements:**
- Xcode installed
- iPhone/iPad connected via USB
- Device trusted and developer mode enabled
- Apple Developer account (free account works for development)

### For Android Physical Device:

```bash
# This will build and install on your connected Android device
npx expo run:android --device

# OR if you want to specify a device:
npx expo run:android --device "device-id"
```

**Requirements:**
- Android Studio installed
- Android device connected via USB
- USB debugging enabled on device
- Device authorized for debugging

## After Building

1. **The app will install automatically** on your device
2. **Start the dev server:**
   ```bash
   npx expo start --dev-client
   ```
3. **Open the app** on your device - it will connect to the dev server
4. **Test cookie capture** - it should work now! 🎉

## Troubleshooting

### iOS: "No devices found"
- Make sure device is connected and trusted
- Check Xcode → Window → Devices and Simulators
- Enable Developer Mode on iOS 16+: Settings → Privacy & Security → Developer Mode

### Android: "No devices found"
- Enable USB debugging: Settings → Developer Options → USB Debugging
- Run `adb devices` to verify device is connected
- Authorize the computer when prompted on device

### Build fails
- Make sure Xcode/Android Studio is fully installed
- Try cleaning: `npx expo prebuild --clean`
- Check that all dependencies installed: `npm install`

## Next Steps

Once the app is installed on your device:
1. Test the D2L login flow
2. Verify cookies are captured when navigating to `/d2l/home`
3. Confirm the HttpOnly cookies (`d2lSessionVal`, `d2lSecureSessionVal`) are accessible

The native cookie manager will work on your physical device! 📱✅

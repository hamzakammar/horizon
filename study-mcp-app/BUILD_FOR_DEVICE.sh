#!/bin/bash
# Build script to force device selection

echo "🔍 Detecting devices..."
xcrun xctrace list devices 2>&1 | grep -v "Simulator" | grep -v "== Devices" | head -5

echo ""
echo "📱 Building for physical device..."
echo ""

# Try to build for the device "Hamza"
# If your device has a different name, change it below
npx expo run:ios --device "Hamza"

# Alternative: If device name doesn't work, try using Xcode directly
# echo "Opening Xcode workspace..."
# echo "In Xcode, select your device from the device dropdown and click Run"
# open ios/studymcpapp.xcworkspace

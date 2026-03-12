import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '../config/api';

// Check if device (expo-device may not be available in all environments)
let Device: any = null;
try {
  Device = require('expo-device');
} catch {
  // expo-device not available
}

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationData {
  type?: string;
  courseId?: string;
  courseName?: string;
  announcementId?: number;
  assignmentId?: number;
  [key: string]: any;
}

/**
 * Request notification permissions and register device token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Device && !Device.isDevice) {
    console.warn('[PUSH] Must use physical device for push notifications');
    return null;
  }

  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PUSH] Permission not granted');
      return null;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // Optional, for EAS builds
    });

    const token = tokenData.data;

    // Register token with backend
    try {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await apiClient.post('/push/register', {
        deviceToken: token,
        platform,
      });
      if (__DEV__) console.log('[PUSH] Device token registered successfully');
    } catch (error) {
      console.error('[PUSH] Failed to register token with backend:', error);
      // Don't fail if backend registration fails - token is still valid
    }

    return token;
  } catch (error) {
    console.error('[PUSH] Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Set up notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) {
  // Listener for notifications received while app is foregrounded
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    if (__DEV__) console.log('[PUSH] Notification received:', notification);
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // Listener for when user taps on a notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    if (__DEV__) console.log('[PUSH] Notification tapped:', response);
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  return () => {
    receivedListener.remove();
    responseListener.remove();
  };
}

/**
 * Get the last notification response (if app was opened from a notification)
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return await Notifications.getLastNotificationResponseAsync();
}

import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { authService } from './src/services/auth';
import { registerForPushNotifications, setupNotificationListeners, getLastNotificationResponse } from './src/services/push';
import { useNavigation } from '@react-navigation/native';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const navigationRef = useRef<any>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Register for push notifications when authenticated
    if (isAuthenticated) {
      registerForPushNotifications().then((token) => {
        if (token) {
          console.log('[APP] Push notification token:', token);
        }
      });

      // Set up notification listeners
      notificationListener.current = setupNotificationListeners(
        (notification) => {
          console.log('[APP] Notification received:', notification);
        },
        (response) => {
          console.log('[APP] Notification tapped:', response);
          const data = response.notification.request.content.data;
          
          // Navigate based on notification type
          if (data?.type === 'announcement' && data?.courseId) {
            // Navigate to course detail
            // Note: This requires navigation to be set up properly
          } else if (data?.type === 'assignment' && data?.courseId) {
            // Navigate to course detail
          }
        }
      );

      // Check if app was opened from a notification
      getLastNotificationResponse().then((response) => {
        if (response) {
          console.log('[APP] App opened from notification:', response);
          const data = response.notification.request.content.data;
          // Handle navigation if needed
        }
      });
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current();
      }
      if (responseListener.current) {
        responseListener.current();
      }
    };
  }, [isAuthenticated]);

  return <AppNavigator />;
}

export default function App() {
  useEffect(() => {
    // Initialize auth on app start
    authService.initialize();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

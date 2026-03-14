import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AntDesign } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignUpScreen from '../screens/Auth/SignUpScreen';
import VerifyEmailScreen from '../screens/Auth/VerifyEmailScreen';
import D2LConnectScreen from '../screens/Auth/D2LConnectScreen';
import D2LWebViewScreen from '../screens/Auth/D2LWebViewScreen';
import PiazzaConnectScreen from '../screens/Auth/PiazzaConnectScreen';
import PiazzaWebViewScreen from '../screens/Auth/PiazzaWebViewScreen';
import DashboardScreen from '../screens/DashboardScreen';
import NotesScreen from '../screens/NotesScreen';
import UploadScreen from '../screens/UploadScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CoursesScreen from '../screens/CoursesScreen';
import CourseDetailScreen from '../screens/CourseDetailScreen';
import PiazzaScreen from '../screens/PiazzaScreen';
import BookmarksScreen from '../screens/BookmarksScreen';
import PDFViewerScreen from '../screens/PDFViewerScreen';
import { ActivityIndicator, View } from 'react-native';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#94a3b8',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          height: 70 + Math.max(insets.bottom - 8, 0),
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
        tabBarIconStyle: { marginTop: 4 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <AntDesign name="home" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesScreen}
        options={{
          tabBarLabel: 'Courses',
          tabBarIcon: ({ color }) => <AntDesign name="book" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{
          tabBarLabel: 'Notes',
          tabBarIcon: ({ color }) => <AntDesign name="filetext1" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Piazza"
        component={PiazzaScreen}
        options={{
          tabBarLabel: 'Piazza',
          tabBarIcon: ({ color }) => <AntDesign name="message1" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <AntDesign name="setting" size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="CourseDetail"
            component={CourseDetailScreen}
            options={{ headerShown: true, title: 'Course' }}
          />
          <Stack.Screen
            name="Bookmarks"
            component={BookmarksScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PDFViewer"
            component={PDFViewerScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Upload"
            component={UploadScreen}
            options={{ presentation: 'modal', headerShown: true, title: 'Upload Note' }}
          />
          <Stack.Screen
            name="D2LConnect"
            component={D2LConnectScreen}
            options={{ headerShown: true, title: 'Connect D2L' }}
          />
          <Stack.Screen
            name="D2LWebView"
            component={D2LWebViewScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PiazzaConnect"
            component={PiazzaConnectScreen}
            options={{ headerShown: true, title: 'Connect Piazza' }}
          />
          <Stack.Screen
            name="PiazzaWebView"
            component={PiazzaWebViewScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen
            name="VerifyEmail"
            component={VerifyEmailScreen}
            options={{ headerShown: true, title: 'Verify Email' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

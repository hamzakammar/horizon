import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import CookieManager from '@react-native-cookies/cookies';
import { apiClient } from '../../config/api';

// Injected into WebView to read document.cookie and post it back
// Much more reliable than CookieManager.get() which doesn't see WKWebView cookies
const COOKIE_READ_SCRIPT = `
(function() {
  window.ReactNativeWebView.postMessage(JSON.stringify({ 
    type: 'cookies', 
    cookies: document.cookie 
  }));
})();
true;
`;

function d2lFetch(host: string, path: string, cookieString: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `https://${host}${path}`, true);
    xhr.setRequestHeader('Cookie', cookieString);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.withCredentials = true;
    xhr.timeout = 15000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid JSON response')); }
      } else {
        reject(new Error(`D2L API error ${xhr.status} on ${path}`));
      }
    };
    xhr.onerror = () => reject(new Error(`Network error on ${path}`));
    xhr.ontimeout = () => reject(new Error(`Timeout on ${path}`));
    xhr.send();
  });
}

export default function D2LWebViewScreen({ route }: any) {
  const { host } = route.params;
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('Please log in to D2L');
  const triggeredRef = useRef(false);

  const injectCookieRead = () => {
    webViewRef.current?.injectJavaScript(COOKIE_READ_SCRIPT);
  };

  const handleNavigationStateChange = (navState: any) => {
    if (__DEV__) console.log('[D2L WebView] Nav:', navState.url, 'loading:', navState.loading);
    if (navState.url.includes('/d2l/home') && !navState.loading && !loggedIn) {
      setLoggedIn(true);
      setStatusText('Logged in! Reading session...');
      setTimeout(injectCookieRead, 600);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type !== 'cookies') return;

      const raw: string = msg.cookies || '';
      const extract = (name: string) => {
        const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
        return m ? m[1] : null;
      };

      const d2lSessionVal = extract('d2lSessionVal');
      const d2lSecureSessionVal = extract('d2lSecureSessionVal');

      if (__DEV__) console.log('[D2L] Cookies from page:', {
        d2lSessionVal: !!d2lSessionVal,
        d2lSecureSessionVal: !!d2lSecureSessionVal,
        raw: raw.substring(0, 100),
      });

      if (!d2lSessionVal || !d2lSecureSessionVal) {
        // Fallback: try CookieManager
        if (__DEV__) console.log('[D2L] Trying CookieManager fallback...');
        const cookies = await CookieManager.get(`https://${host}`, true);
        const sv = cookies.d2lSessionVal?.value;
        const ssv = cookies.d2lSecureSessionVal?.value;
        if (!sv || !ssv) {
          Alert.alert('Login Required', 'Could not read session cookies. Please log in to D2L fully and tap Connect again.');
          return;
        }
        await doSync(`d2lSessionVal=${sv}; d2lSecureSessionVal=${ssv}`);
        return;
      }

      await doSync(`d2lSessionVal=${d2lSessionVal}; d2lSecureSessionVal=${d2lSecureSessionVal}`);
    } catch (e: any) {
      console.error('[D2L WebView] handleMessage error:', e);
    }
  };

  const doSync = async (cookieString: string) => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    setSubmitting(true);

    try {
      setStatusText('Fetching your courses...');
      const enrollmentsResponse = await d2lFetch(
        host, '/d2l/api/lp/1.43/enrollments/myenrollments/', cookieString
      );

      const activeCourses = (enrollmentsResponse.Items || []).filter(
        (e: any) =>
          e.OrgUnit?.Type?.Code === 'Course Offering' &&
          e.Access?.IsActive &&
          e.Access?.CanAccess
      );

      if (__DEV__) console.log(`[D2L] ${activeCourses.length} active courses`);
      setStatusText(`Syncing ${activeCourses.length} courses...`);

      const courseData: Array<{ orgUnitId: number; name: string; assignments: any[] }> = [];
      for (const enrollment of activeCourses) {
        const orgUnitId = enrollment.OrgUnit.Id;
        const courseName = enrollment.OrgUnit.Name;
        try {
          const folders = await d2lFetch(
            host, `/d2l/api/le/1.57/${orgUnitId}/dropbox/folders/`, cookieString
          );
          courseData.push({
            orgUnitId,
            name: courseName,
            assignments: Array.isArray(folders) ? folders : (folders.Objects || []),
          });
        } catch {
          courseData.push({ orgUnitId, name: courseName, assignments: [] });
        }
      }

      setStatusText('Saving to your account...');
      await apiClient.post('/d2l/connect-and-sync', { host, cookies: cookieString, courseData });

      if (__DEV__) console.log('[D2L] Done');
      navigation.goBack();
    } catch (error: any) {
      console.error('[D2L] Sync error:', error);
      Alert.alert('Error', error.message || 'Failed to connect to D2L');
      setSubmitting(false);
      triggeredRef.current = false;
      setStatusText('Tap Connect to try again');
    }
  };

  const handleManualConnect = () => {
    triggeredRef.current = false;
    setStatusText('Reading session...');
    injectCookieRead();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AntDesign name="close" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>Sign in to D2L</Text>
        <View style={styles.placeholder} />
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: `https://${host}/d2l/home` }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        onError={(e) => console.error('[D2L WebView] Error:', e.nativeEvent)}
        onHttpError={(e) => console.error('[D2L WebView] HTTP Error:', e.nativeEvent)}
      />

      <View style={styles.footer}>
        <View style={styles.tokenStatus}>
          {loggedIn
            ? <AntDesign name="checkcircle" size={20} color="#10b981" />
            : <AntDesign name="info" size={20} color="#6366f1" />
          }
          <Text style={styles.tokenStatusText}>{statusText}</Text>
          {submitting && <ActivityIndicator size="small" color="#6366f1" style={{ marginLeft: 8 }} />}
        </View>

        {loggedIn && !submitting && (
          <TouchableOpacity style={styles.connectButton} onPress={handleManualConnect}>
            <AntDesign name="link" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.connectButtonText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#1e293b' },
  placeholder: { width: 32 },
  loadingContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: '#64748b' },
  webview: { flex: 1 },
  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff',
  },
  tokenStatus: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    padding: 12, backgroundColor: '#f1f5f9', borderRadius: 8,
  },
  tokenStatusText: { flex: 1, marginLeft: 8, fontSize: 14, color: '#475569' },
  connectButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6366f1', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8,
  },
  connectButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

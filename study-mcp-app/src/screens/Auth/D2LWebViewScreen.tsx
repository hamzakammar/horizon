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
import { d2lService } from '../../services/d2l';

interface D2LWebViewScreenProps {
  route: {
    params: {
      host: string;
      username?: string;
      password?: string;
    };
  };
}

export default function D2LWebViewScreen({ route }: D2LWebViewScreenProps) {
  const { host, username, password } = route.params;
  const navigation = useNavigation();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [capturedCookies, setCapturedCookies] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const d2lUrl = `https://${host}/d2l/home`;

  const handleNavigationStateChange = async (navState: any) => {
    // Check if we've navigated to the D2L home page (successful login)
    if (navState.url.includes('/d2l/home')) {
      console.log('[D2L WebView] Navigated to /d2l/home, capturing cookies...');
      
      try {
        // Get all cookies for the current URL
        const cookies = await CookieManager.get(navState.url, true);
        console.log('[D2L WebView] Retrieved cookies:', Object.keys(cookies));
        
        // Extract the two required cookies
        const d2lSessionVal = cookies.d2lSessionVal?.value;
        const d2lSecureSessionVal = cookies.d2lSecureSessionVal?.value;
        
        if (d2lSessionVal && d2lSecureSessionVal) {
          // Format cookies as a cookie string
          const cookieString = `d2lSessionVal=${d2lSessionVal}; d2lSecureSessionVal=${d2lSecureSessionVal}`;
          console.log('[D2L WebView] Both required cookies found!');
          setCapturedCookies(cookieString);
          
          // Automatically connect and navigate back
          if (!submitting) {
            setTimeout(() => handleSubmit(cookieString), 500);
          }
        } else {
          console.log('[D2L WebView] Missing required cookies. Found:', {
            d2lSessionVal: !!d2lSessionVal,
            d2lSecureSessionVal: !!d2lSecureSessionVal,
          });
        }
      } catch (error: any) {
        console.error('[D2L WebView] Error capturing cookies:', error);
        Alert.alert('Error', 'Failed to capture session cookies. Please try again.');
      }
    }
  };

  const handleSubmit = async (cookieString?: string) => {
    const cookiesToUse = cookieString || capturedCookies;
    
    if (!cookiesToUse) {
      Alert.alert('No Credentials', 'Please log in first.');
      return;
    }

    setSubmitting(true);
    try {
      await d2lService.connectWithCookies({ host, cookies: cookiesToUse });
      
      // Automatically navigate back to dashboard on success
      // No alert needed - smooth transition
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to connect');
      setSubmitting(false);
    }
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
        source={{ uri: d2lUrl }}
        style={styles.webview}
        onLoadStart={() => {
          setLoading(true);
          console.log('[D2L WebView] Load started');
        }}
        onLoadEnd={() => {
          setLoading(false);
          console.log('[D2L WebView] Load ended');
        }}
        onNavigationStateChange={handleNavigationStateChange}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[D2L WebView] Error:', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[D2L WebView] HTTP Error:', nativeEvent);
        }}
      />

      <View style={styles.footer}>
        {capturedCookies ? (
          <View style={styles.tokenStatus}>
            <AntDesign name="checkcircle" size={20} color="#10b981" />
            <Text style={styles.tokenStatusText}>Session captured! Connecting...</Text>
          </View>
        ) : (
          <View style={styles.tokenStatus}>
            <AntDesign name="info" size={20} color="#6366f1" />
            <Text style={styles.tokenStatusText}>
              {username && password ? 'Auto-login in progress...' : 'Please log in to D2L'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.connectButton, (!capturedCookies || submitting) && styles.connectButtonDisabled]}
          onPress={() => handleSubmit()}
          disabled={!capturedCookies || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <AntDesign name="link" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.connectButtonText}>Connect</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  placeholder: {
    width: 32,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  webview: {
    flex: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  tokenStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  tokenStatusText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#475569',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  connectButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { d2lService } from '../../services/d2l';

export default function D2LConnectScreen() {
  const [host, setHost] = useState('learn.ul.ie');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const [statusMessage, setStatusMessage] = useState<string>('');

  const handleConnect = async () => {
    if (!host || !username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    setStatusMessage('Storing credentials...');
    try {
      setStatusMessage('Verifying credentials with D2L...\nThis may take 30-60 seconds...');
      await d2lService.connect({ host, username, password });
      setStatusMessage('');
      Alert.alert(
        'Success',
        'D2L connected and verified successfully! You can now sync your courses and announcements.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Small delay to ensure backend has processed
              setTimeout(() => {
                navigation.goBack();
              }, 300);
            },
          },
        ]
      );
    } catch (error: any) {
      setStatusMessage('');
      const errorMsg = error.message || 'Failed to connect to D2L';
      if (errorMsg.includes('Invalid') || errorMsg.includes('credentials')) {
        Alert.alert(
          'Authentication Failed',
          'The username or password you entered is incorrect. Please check your credentials and try again.',
          [{ text: 'OK' }]
        );
      } else if (errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET')) {
        Alert.alert(
          'Connection Timeout',
          'The authentication process took too long. This might be due to network issues or D2L being slow. Please try again.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Connection Failed', errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Connect to D2L</Text>
          <Text style={styles.subtitle}>
            Enter your D2L Brightspace credentials to sync courses, assignments, and grades.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>D2L Host</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., learn.ul.ie"
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.helpText}>Your institution's D2L Brightspace URL</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Your D2L username or email"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Your D2L password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {statusMessage ? (
            <View style={styles.statusContainer}>
              <ActivityIndicator size="small" color="#6366f1" style={{ marginRight: 8 }} />
              <Text style={styles.statusText}>{statusMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <>
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Connecting...</Text>
              </>
            ) : (
              <>
                <AntDesign name="link" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>Connect</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>🔒 Security</Text>
            <Text style={styles.infoText}>
              Your credentials are securely stored and only used to authenticate with D2L. 
              They are encrypted and never shared.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
  },
  form: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#1e293b',
  },
  helpText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 18,
    marginTop: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    color: '#4338ca',
    lineHeight: 20,
  },
});

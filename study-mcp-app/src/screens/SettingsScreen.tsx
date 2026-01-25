import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { d2lService } from '../services/d2l';
import { piazzaService } from '../services/piazza';
import { notesService } from '../services/notes';

interface IntegrationStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: string;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [d2lStatus, setD2lStatus] = useState<IntegrationStatus>({
    connected: false,
    syncing: false,
  });
  const [piazzaStatus, setPiazzaStatus] = useState<IntegrationStatus>({
    connected: false,
    syncing: false,
  });

  useEffect(() => {
    loadIntegrationStatus();
  }, []);

  const loadIntegrationStatus = async () => {
    try {
      const [d2l, piazza] = await Promise.all([
        d2lService.getStatus(),
        piazzaService.getStatus(),
      ]);
      setD2lStatus(d2l);
      setPiazzaStatus(piazza);
    } catch (error) {
      console.error('Error loading integration status:', error);
    }
  };

  const handleD2LConnect = async () => {
    // TODO: Navigate to D2L connection screen or open browser for OAuth
    Alert.alert(
      'Connect to D2L',
      'D2L connection will be implemented. This will allow you to sync courses, assignments, and content.',
      [{ text: 'OK' }]
    );
  };

  const handleD2LSync = async () => {
    setD2lStatus((prev) => ({ ...prev, syncing: true }));
    try {
      await d2lService.syncAll();
      Alert.alert('Success', 'D2L data synced successfully');
      await loadIntegrationStatus();
    } catch (error: any) {
      Alert.alert('Sync Failed', error.message || 'Failed to sync D2L data');
    } finally {
      setD2lStatus((prev) => ({ ...prev, syncing: false }));
    }
  };

  const handlePiazzaConnect = async () => {
    // TODO: Navigate to Piazza connection screen
    Alert.alert(
      'Connect to Piazza',
      'Piazza connection will be implemented. This will allow you to sync posts and discussions.',
      [{ text: 'OK' }]
    );
  };

  const handlePiazzaSync = async () => {
    setPiazzaStatus((prev) => ({ ...prev, syncing: true }));
    try {
      await piazzaService.syncAll();
      Alert.alert('Success', 'Piazza data synced successfully');
      await loadIntegrationStatus();
    } catch (error: any) {
      Alert.alert('Sync Failed', error.message || 'Failed to sync Piazza data');
    } finally {
      setPiazzaStatus((prev) => ({ ...prev, syncing: false }));
    }
  };

  const handleEmbedMissing = async () => {
    Alert.alert(
      'Embed Missing Notes',
      'This will generate embeddings for notes that haven\'t been embedded yet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              await notesService.embedMissing();
              Alert.alert('Success', 'Embedding process started');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to start embedding');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integrations</Text>

        {/* D2L Integration */}
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <Text style={styles.integrationName}>D2L Brightspace</Text>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  d2lStatus.connected ? styles.statusConnected : styles.statusDisconnected,
                ]}
              />
              <Text style={styles.statusText}>
                {d2lStatus.connected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>
          </View>
          <Text style={styles.integrationDescription}>
            Sync courses, assignments, grades, and content from D2L Brightspace
          </Text>
          {d2lStatus.lastSync && (
            <Text style={styles.lastSync}>Last sync: {new Date(d2lStatus.lastSync).toLocaleString()}</Text>
          )}
          <View style={styles.integrationActions}>
            {!d2lStatus.connected ? (
              <TouchableOpacity style={styles.connectButton} onPress={handleD2LConnect}>
                <Text style={styles.connectButtonText}>Connect</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.syncButton, d2lStatus.syncing && styles.syncButtonDisabled]}
                onPress={handleD2LSync}
                disabled={d2lStatus.syncing}
              >
                {d2lStatus.syncing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Piazza Integration */}
        <View style={styles.integrationCard}>
          <View style={styles.integrationHeader}>
            <Text style={styles.integrationName}>Piazza</Text>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  piazzaStatus.connected ? styles.statusConnected : styles.statusDisconnected,
                ]}
              />
              <Text style={styles.statusText}>
                {piazzaStatus.connected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>
          </View>
          <Text style={styles.integrationDescription}>
            Sync posts, discussions, and Q&A from Piazza
          </Text>
          {piazzaStatus.lastSync && (
            <Text style={styles.lastSync}>Last sync: {new Date(piazzaStatus.lastSync).toLocaleString()}</Text>
          )}
          <View style={styles.integrationActions}>
            {!piazzaStatus.connected ? (
              <TouchableOpacity style={styles.connectButton} onPress={handlePiazzaConnect}>
                <Text style={styles.connectButtonText}>Connect</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.syncButton, piazzaStatus.syncing && styles.syncButtonDisabled]}
                onPress={handlePiazzaSync}
                disabled={piazzaStatus.syncing}
              >
                {piazzaStatus.syncing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleEmbedMissing}>
          <Text style={styles.actionButtonText}>Embed Missing Notes</Text>
          <Text style={styles.actionButtonSubtext}>
            Generate embeddings for notes that haven't been processed
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity
          style={[styles.actionButton, styles.logoutButton]}
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: logout,
              },
            ]);
          }}
        >
          <Text style={[styles.actionButtonText, styles.logoutButtonText]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  integrationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  integrationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  integrationName: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#999',
  },
  statusText: {
    fontSize: 12,
    color: '#666',
  },
  integrationDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  lastSync: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  integrationActions: {
    marginTop: 8,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  connectButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  syncButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionButtonSubtext: {
    fontSize: 14,
    color: '#666',
  },
  logoutButton: {
    backgroundColor: '#fff',
  },
  logoutButtonText: {
    color: '#FF3B30',
  },
});

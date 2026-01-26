import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { dashboardService } from '../services/dashboard';
import { DashboardResponse, Note } from '../types';
import { useAuth } from '../context/AuthContext';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { logout, user } = useAuth();

  const loadDashboard = async () => {
    try {
      const data = await dashboardService.getDashboard();
      setDashboard(data);
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
      // Show user-friendly error message
      if (error.response?.status === 502 || error.response?.status === 504) {
        // Backend not available or timeout
        console.warn('Backend server not available or timed out. Make sure the backend is running.');
      } else if (error.response?.status === 503) {
        // Service unavailable - likely database issue
        const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Database connection issue';
        console.warn('Service unavailable (503):', errorMsg);
        Alert.alert(
          'Service Unavailable',
          errorMsg + '\n\nThis usually means the database is not configured or not accessible. Check backend logs.',
          [{ text: 'OK' }]
        );
      } else if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
        console.warn('Cannot connect to backend. Check API_BASE_URL configuration.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Header with gradient effect */}
        <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.userName}>
            {(() => {
              // Check if name exists and is not a UUID
              const isUUID = (str: string | undefined): boolean => {
                if (!str) return false;
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(str);
              };
              
              if (user?.name && !isUUID(user.name)) {
                return user.name;
              }
              
              // Fall back to formatted email
              if (user?.email) {
                return user.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              }
              
              return 'User';
            })()}
          </Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <AntDesign name="poweroff" size={16} color="#6366f1" style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, styles.statCardPrimary]}>
          <View style={styles.statIconContainer}>
            <AntDesign name="book" size={24} color="#6366f1" />
          </View>
          <Text style={styles.statValue}>{dashboard?.stats.notesCount || 0}</Text>
          <Text style={styles.statLabel}>Total Notes</Text>
        </View>
        <View style={[styles.statCard, styles.statCardSecondary]}>
          <View style={styles.statIconContainer}>
            <AntDesign name="file-text" size={24} color="#8b5cf6" />
          </View>
          <Text style={styles.statValue}>{dashboard?.usage.totalChunks || 0}</Text>
          <Text style={styles.statLabel}>Chunks</Text>
        </View>
      </View>

      {/* My Courses Card */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.coursesCard}
          onPress={() => navigation.navigate('Courses' as never)}
          activeOpacity={0.7}
        >
          <View style={styles.coursesCardContent}>
            <View style={styles.coursesIconContainer}>
              <AntDesign name="book" size={28} color="#6366f1" />
            </View>
            <View style={styles.coursesTextContainer}>
              <Text style={styles.coursesTitle}>My Courses</Text>
              <Text style={styles.coursesSubtitle}>View your D2L courses and announcements</Text>
            </View>
            <AntDesign name="right" size={20} color="#94a3b8" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Recent Notes Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Notes</Text>
        {dashboard?.recentNotes && dashboard.recentNotes.length > 0 ? (
          dashboard.recentNotes.map((note) => (
            <TouchableOpacity key={note.id} style={styles.noteCard} activeOpacity={0.7}>
              <View style={styles.noteCardHeader}>
                <View style={styles.noteIcon}>
                  <AntDesign name="file-text" size={20} color="#6366f1" />
                </View>
                <View style={styles.noteContent}>
                  <Text style={styles.noteTitle} numberOfLines={1}>{note.title}</Text>
                  {note.courseId && (
                    <View style={styles.courseBadge}>
                      <Text style={styles.courseText}>{note.courseId}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.noteFooter}>
                <Text style={styles.noteDate}>
                  {new Date(note.createdAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </Text>
                {note.status && (
                  <View style={[styles.statusBadge, note.status === 'ready' && styles.statusReady]}>
                    <Text style={styles.statusText}>{note.status}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <AntDesign name="mail" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>No notes yet</Text>
            <Text style={styles.emptySubtext}>Upload your first note to get started</Text>
          </View>
        )}
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
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  greeting: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    textTransform: 'capitalize',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  logoutText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statCardPrimary: {
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  statCardSecondary: {
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  noteIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  noteContent: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  courseBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  courseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  noteDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  statusReady: {
    backgroundColor: '#dcfce7',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  coursesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  coursesCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coursesIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  coursesTextContainer: {
    flex: 1,
  },
  coursesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  coursesSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
});

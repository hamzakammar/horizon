import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { d2lService } from '../services/d2l';

interface Announcement {
  id: number;
  title: string;
  body: string;
  date: string | null;
  attachments?: Array<{ name: string; size: string }>;
}

interface Course {
  id: string;
  name: string;
  code: string;
  orgUnitId: number;
}

export default function CourseDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { course } = (route.params as { course: Course }) || {};
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'announcements' | 'content'>('announcements');

  useEffect(() => {
    if (course) {
      loadAnnouncements();
    }
  }, [course]);

  const loadAnnouncements = async () => {
    if (!course) return;
    
    try {
      setError(null);
      const data = await d2lService.getAnnouncements(course.id);
      // Sort by date, most recent first
      const sorted = data.sort((a: Announcement, b: Announcement) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      setAnnouncements(sorted);
    } catch (err: any) {
      console.error('Error loading announcements:', err);
      setError(err.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAnnouncements();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (!course) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Course not found</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading course content...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.courseHeader}>
          <View style={styles.courseIcon}>
            <AntDesign name="book" size={24} color="#6366f1" />
          </View>
          <View style={styles.courseInfo}>
            <Text style={styles.courseName}>{course.name}</Text>
            {course.code && (
              <Text style={styles.courseCode}>{course.code}</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'announcements' && styles.activeTab]}
          onPress={() => setActiveTab('announcements')}
        >
          <AntDesign 
            name="notification" 
            size={18} 
            color={activeTab === 'announcements' ? '#6366f1' : '#94a3b8'} 
          />
          <Text style={[styles.tabText, activeTab === 'announcements' && styles.activeTabText]}>
            Announcements
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'content' && styles.activeTab]}
          onPress={() => setActiveTab('content')}
        >
          <AntDesign 
            name="filetext" 
            size={18} 
            color={activeTab === 'content' ? '#6366f1' : '#94a3b8'} 
          />
          <Text style={[styles.tabText, activeTab === 'content' && styles.activeTabText]}>
            Content
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'announcements' && (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {error && (
            <View style={styles.errorContainer}>
              <AntDesign name="exclamationcircleo" size={32} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadAnnouncements}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!error && announcements.length === 0 && (
            <View style={styles.emptyContainer}>
              <AntDesign name="notification" size={48} color="#94a3b8" />
              <Text style={styles.emptyText}>No announcements</Text>
              <Text style={styles.emptySubtext}>
                Check back later for updates from your instructor
              </Text>
            </View>
          )}

          {!error && announcements.map((announcement) => (
            <View key={announcement.id} style={styles.announcementCard}>
              <View style={styles.announcementHeader}>
                <Text style={styles.announcementTitle}>{announcement.title}</Text>
                {announcement.date && (
                  <Text style={styles.announcementDate}>
                    {formatDate(announcement.date)}
                  </Text>
                )}
              </View>
              {announcement.body && (
                <Text style={styles.announcementBody}>{announcement.body}</Text>
              )}
              {announcement.attachments && announcement.attachments.length > 0 && (
                <View style={styles.attachmentsContainer}>
                  <Text style={styles.attachmentsLabel}>Attachments:</Text>
                  {announcement.attachments.map((att, idx) => (
                    <View key={idx} style={styles.attachmentItem}>
                      <AntDesign name="paperclip" size={14} color="#64748b" />
                      <Text style={styles.attachmentText}>
                        {att.name} ({att.size})
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === 'content' && (
        <View style={styles.content}>
          <View style={styles.emptyContainer}>
            <AntDesign name="filetext" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>Course content coming soon</Text>
            <Text style={styles.emptySubtext}>
              This feature will show course modules, topics, and materials
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  courseIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  courseInfo: {
    flex: 1,
  },
  courseName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  courseCode: {
    fontSize: 14,
    color: '#64748b',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#6366f1',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#94a3b8',
  },
  activeTabText: {
    color: '#6366f1',
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  announcementCard: {
    backgroundColor: '#ffffff',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  announcementHeader: {
    marginBottom: 12,
  },
  announcementTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  announcementDate: {
    fontSize: 12,
    color: '#64748b',
  },
  announcementBody: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 12,
  },
  attachmentsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  attachmentsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  attachmentText: {
    fontSize: 14,
    color: '#64748b',
  },
});

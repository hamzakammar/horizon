import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { d2lService } from '../services/d2l';
import { useAuth } from '../context/AuthContext';

interface Course {
  id: string;
  name: string;
  code: string;
  orgUnitId: number;
  startDate?: string;
  endDate?: string;
}

export default function CoursesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      setError(null);
      const data = await d2lService.getCourses();
      setCourses(data);
    } catch (err: any) {
      console.error('Error loading courses:', err);
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadCourses();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadCourses();
  };

  const renderCourse = ({ item }: { item: Course }) => (
    <TouchableOpacity
      style={styles.courseCard}
      onPress={() => navigation.navigate('CourseDetail' as never, { course: item } as never)}
    >
      <View style={styles.courseHeader}>
        <View style={styles.courseIcon}>
          <AntDesign name="book" size={24} color="#6366f1" />
        </View>
        <View style={styles.courseInfo}>
          <Text style={styles.courseName}>{item.name}</Text>
          {item.code && (
            <Text style={styles.courseCode}>{item.code}</Text>
          )}
        </View>
        <AntDesign name="right" size={20} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading courses...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <AntDesign name="exclamationcircleo" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadCourses}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (courses.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <AntDesign name="book" size={64} color="#94a3b8" />
        <Text style={styles.emptyText}>No courses found</Text>
        <Text style={styles.emptySubtext}>
          Make sure you're connected to D2L in Settings
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={courses}
        renderItem={renderCourse}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
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
  errorText: {
    marginTop: 16,
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
  listContent: {
    padding: 16,
  },
  courseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  courseCode: {
    fontSize: 14,
    color: '#64748b',
  },
});

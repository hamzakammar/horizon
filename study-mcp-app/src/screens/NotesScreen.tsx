import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AntDesign } from '@expo/vector-icons';
import { notesService } from '../services/notes';
import { Note } from '../types';

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const loadNotes = async () => {
    try {
      const data = await notesService.getNotes();
      setNotes(data);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotes();
  };

  const renderNote = ({ item }: { item: Note }) => (
    <TouchableOpacity style={styles.noteCard}>
      <Text style={styles.noteTitle}>{item.title}</Text>
      {item.courseId && (
        <Text style={styles.noteCourse}>{item.courseId}</Text>
      )}
      <View style={styles.noteMeta}>
        {item.pageCount && (
          <Text style={styles.metaText}>{item.pageCount} pages</Text>
        )}
        {item.chunkCount && (
          <Text style={styles.metaText}>{item.chunkCount} chunks</Text>
        )}
      </View>
      <Text style={styles.noteDate}>
        {new Date(item.createdAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Notes</Text>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => {
            // @ts-ignore - navigation type will be fixed later
            navigation.navigate('Upload');
          }}
        >
          <AntDesign name="plus" size={16} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.uploadButtonText}>Upload</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <Text>Loading notes...</Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          renderItem={renderNote}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <AntDesign name="mail" size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyText}>No notes yet</Text>
              <Text style={styles.emptySubtext}>Upload your first note to get started</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e293b',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    padding: 24,
  },
  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  noteCourse: {
    fontSize: 13,
    color: '#6366f1',
    fontWeight: '600',
    marginBottom: 12,
  },
  noteMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  noteDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});

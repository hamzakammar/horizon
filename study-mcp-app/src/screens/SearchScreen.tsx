import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AntDesign } from '@expo/vector-icons';
import { searchService } from '../services/search';
import { SearchHit } from '../types';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }

    setLoading(true);
    try {
      const hits = await searchService.search({ q: query });
      setResults(hits);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderResult = ({ item }: { item: SearchHit }) => (
    <TouchableOpacity style={styles.resultCard}>
      <Text style={styles.resultTitle}>{item.title}</Text>
      <Text style={styles.resultSnippet} numberOfLines={3}>
        {item.snippet}
      </Text>
      <View style={styles.resultMeta}>
        <Text style={styles.resultScore}>Score: {item.score.toFixed(2)}</Text>
        {item.courseId && (
          <Text style={styles.resultCourse}>{item.courseId}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <AntDesign name="search" size={20} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your notes..."
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity
          style={[styles.searchButton, loading && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <AntDesign name="search" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.searchButtonText}>Search</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {results.length > 0 && (
        <Text style={styles.resultsCount}>{results.length} results found</Text>
      )}

      <FlatList
        data={results}
        renderItem={renderResult}
        keyExtractor={(item, index) => `${item.sectionId}-${index}`}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading && query ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No results found</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  searchIcon: {
    marginLeft: 14,
  },
  searchInput: {
    flex: 1,
    padding: 14,
    paddingLeft: 8,
    fontSize: 16,
    color: '#1e293b',
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  resultsCount: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  listContent: {
    padding: 24,
  },
  resultCard: {
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
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  resultSnippet: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 14,
    lineHeight: 20,
  },
  resultMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  resultScore: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  resultCourse: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
});

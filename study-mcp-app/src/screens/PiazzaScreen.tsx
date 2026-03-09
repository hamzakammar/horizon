import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AntDesign } from '@expo/vector-icons';
import { piazzaService } from '../services/piazza';
import { colors } from '../theme';

interface PiazzaPost {
  id: string;
  title: string;
  type: string; // 'question' | 'note' | 'poll'
  author?: string;
  date?: string;
  snippet?: string;
  answered?: boolean;
  courseId?: string;
}

export default function PiazzaScreen() {
  const [posts, setPosts] = useState<PiazzaPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      const status = await piazzaService.getStatus();
      setConnected(status.connected);
    } catch {
      setConnected(false);
    }
  };

  const loadPosts = async () => {
    try {
      setError(null);
      await checkStatus();
      const results = await piazzaService.getPosts();
      setPosts(results as PiazzaPost[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load Piazza posts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const performSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await piazzaService.search(searchQuery.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch();
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPosts();
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'question': return 'questioncircleo';
      case 'note': return 'filetext1';
      case 'poll': return 'barchart';
      default: return 'message1';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'question': return colors.sun;
      case 'note': return colors.accent;
      default: return colors.secondary;
    }
  };

  const renderPost = ({ item }: { item: any }) => (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={[styles.typeIcon, { backgroundColor: getTypeColor(item.type) + '22' }]}>
          <AntDesign name={getTypeIcon(item.type) as any} size={18} color={getTypeColor(item.type)} />
        </View>
        <View style={styles.postMeta}>
          <Text style={styles.postType}>{item.type || 'post'}</Text>
          {item.answered !== undefined && (
            <View style={[styles.answeredBadge, item.answered && styles.answeredBadgeYes]}>
              <Text style={styles.answeredText}>{item.answered ? 'answered' : 'unanswered'}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.postTitle} numberOfLines={2}>{item.title || item.subject || 'Untitled'}</Text>
      {item.snippet && (
        <Text style={styles.postSnippet} numberOfLines={2}>{item.snippet}</Text>
      )}
      <View style={styles.postFooter}>
        {item.author && <Text style={styles.postAuthor}>{item.author}</Text>}
        {item.date && (
          <Text style={styles.postDate}>
            {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </View>
    </View>
  );

  const displayData = searchQuery.trim() ? searchResults : posts;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Piazza</Text>
        {!connected && (
          <View style={styles.disconnectedBadge}>
            <Text style={styles.disconnectedText}>Not connected</Text>
          </View>
        )}
      </View>

      <View style={styles.searchContainer}>
        <AntDesign name="search1" size={20} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search posts..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={performSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
            <AntDesign name="closecircle" size={20} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading posts...</Text>
        </View>
      ) : isSearching ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <AntDesign name="exclamationcircleo" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadPosts}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayData}
          renderItem={renderPost}
          keyExtractor={(item, i) => item.id || `post-${i}`}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <AntDesign name="message1" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>
                {searchQuery.trim() ? 'No results found' : connected ? 'No posts yet' : 'Connect Piazza in Integrations'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  disconnectedBadge: {
    backgroundColor: colors.warning + '22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  disconnectedText: { fontSize: 12, color: colors.warning, fontWeight: '600' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  listContent: { padding: 24 },
  postCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  postType: { fontSize: 12, fontWeight: '600', color: colors.muted, textTransform: 'capitalize' },
  answeredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.light,
  },
  answeredBadgeYes: { backgroundColor: '#dcfce7' },
  answeredText: { fontSize: 11, fontWeight: '600', color: colors.muted },
  postTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 6 },
  postSnippet: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 8 },
  postFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  postAuthor: { fontSize: 12, color: colors.accent, fontWeight: '500' },
  postDate: { fontSize: 12, color: colors.muted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 40 },
  loadingText: { marginTop: 12, fontSize: 16, color: colors.muted },
  errorText: { marginTop: 12, fontSize: 16, color: colors.error, textAlign: 'center' },
  emptyText: { marginTop: 12, fontSize: 16, color: colors.muted, textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

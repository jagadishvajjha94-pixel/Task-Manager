import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  FlatList,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeScreen } from '../components/SafeScreen';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getBoard } from '../api/client';
import { colors, spacing, borderRadius, typography, shadows } = theme;

function getAssignees(card) {
  if (Array.isArray(card.assignees) && card.assignees.length) return card.assignees.join(', ');
  if (card.assigneeName) return card.assigneeName;
  return '—';
}

function TaskCard({ card, onPress }) {
  const assignees = getAssignees(card);
  const urgency = (card.urgency || 'medium').toLowerCase();
  const urgencyColor = urgency === 'high' ? colors.danger : urgency === 'low' ? colors.success : colors.warning;
  const isDone = !!card.completedAt;

  return (
    <TouchableOpacity
      style={[styles.taskCard, shadows.sm]}
      onPress={() => onPress(card)}
      activeOpacity={0.85}
    >
      <View style={styles.taskCardHeader}>
        <Text style={styles.taskTitle} numberOfLines={2}>{card.title || 'Untitled'}</Text>
        <View style={[styles.urgencyDot, { backgroundColor: urgencyColor }]} />
      </View>
      {card.description ? (
        <Text style={styles.taskDesc} numberOfLines={2}>{card.description}</Text>
      ) : null}
      <View style={styles.taskMeta}>
        <Text style={styles.taskAssignees} numberOfLines={1}>{assignees}</Text>
        {isDone && <Text style={styles.doneBadge}>Done</Text>}
      </View>
    </TouchableOpacity>
  );
}

export function BoardScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getBoard(user);
      setBoard(data);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const columns = board?.columns || [];
  const allCards = [];
  columns.forEach(col => {
    (col.cards || []).forEach(c => allCards.push({ ...c, columnId: col.id, columnTitle: col.title }));
  });

  const openTask = (card) => {
    navigation.navigate('TaskDetail', { card });
  };

  const horizontalPadding = spacing.lg * 2;
  const gap = spacing.md;
  const numColumns = width > 420 ? 2 : 1;
  const totalGap = numColumns > 1 ? gap * (numColumns - 1) : 0;
  const cardWidth = numColumns > 1
    ? (width - horizontalPadding - totalGap) / numColumns
    : width - horizontalPadding;

  if (loading) {
    return (
      <SafeScreen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading tasks…</Text>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen scroll={false} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Tasks</Text>
          <Text style={styles.headerSubtitle}>{user?.name || 'User'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => signOut()} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={allCards}
        keyExtractor={(item) => item.id || String(Math.random())}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={[styles.listContent, { paddingHorizontal: spacing.lg }]}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tasks yet</Text>
            <Text style={styles.emptyHint}>Pull to refresh</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.cardWrap, numColumns > 1 && { width: cardWidth }]}>
            <TaskCard card={item} onPress={openTask} />
          </View>
        )}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flex: 1 },
  logoutBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  logoutText: {
    ...typography.label,
    color: colors.primary,
    fontSize: 14,
  },
  headerTitle: {
    ...typography.title,
    color: colors.text,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardWrap: {
    marginBottom: spacing.md,
    flex: 1,
    maxWidth: '100%',
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  taskCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  taskTitle: {
    ...typography.subtitle,
    color: colors.text,
    flex: 1,
  },
  urgencyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
    marginTop: 6,
  },
  taskDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskAssignees: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  doneBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
    marginLeft: spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});

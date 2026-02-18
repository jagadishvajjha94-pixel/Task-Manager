import React from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeScreen } from '../components/SafeScreen';
import { theme } from '../theme';
import { colors, spacing, borderRadius, typography } = theme;

function getAssignees(card) {
  if (Array.isArray(card.assignees) && card.assignees.length) return card.assignees.join(', ');
  if (card.assigneeName) return card.assigneeName;
  return '—';
}

export function TaskDetailScreen({ route }) {
  const { card } = route.params || {};
  const { width } = useWindowDimensions();
  const maxContentWidth = Math.min(width - spacing.lg * 2, 500);

  if (!card) {
    return (
      <SafeScreen scroll={false}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No task selected</Text>
        </View>
      </SafeScreen>
    );
  }

  const assignees = getAssignees(card);
  const urgency = (card.urgency || 'medium').toLowerCase();
  const urgencyColor = urgency === 'high' ? colors.danger : urgency === 'low' ? colors.success : colors.warning;
  const comments = Array.isArray(card.comments) ? card.comments : [];

  return (
    <SafeScreen scroll={true} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.container, { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.section}>
          <Text style={styles.title}>{card.title || 'Untitled'}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor + '22' }]}>
              <Text style={[styles.urgencyText, { color: urgencyColor }]}>{urgency}</Text>
            </View>
            {card.department ? (
              <Text style={styles.dept}>{card.department}</Text>
            ) : null}
          </View>
        </View>

        {card.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.body}>{card.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assigned to</Text>
          <Text style={styles.body}>{assignees}</Text>
        </View>

        {card.assignedByName ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assigned by</Text>
            <Text style={styles.body}>{card.assignedByName}</Text>
          </View>
        ) : null}

        {card.deadline ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deadline</Text>
            <Text style={styles.body}>{new Date(card.deadline).toLocaleString()}</Text>
          </View>
        ) : null}

        {comments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comments ({comments.length})</Text>
            {comments.slice(-10).reverse().map((c) => (
              <View key={c.id || c.createdAt} style={styles.comment}>
                <Text style={styles.commentAuthor}>{c.authorName || 'Someone'}</Text>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },
  container: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  urgencyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  urgencyText: {
    ...typography.caption,
    fontWeight: '600',
  },
  dept: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.text,
  },
  comment: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  commentAuthor: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  commentText: {
    ...typography.body,
    color: colors.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Keeps all content inside screen bounds. Use scroll when content may overflow.
 */
export function SafeScreen({
  children,
  scroll = false,
  keyboardAvoid = false,
  style,
  contentContainerStyle,
  edges = ['top', 'bottom'],
}) {
  const { height } = useWindowDimensions();
  const containerStyle = [styles.container, { minHeight: height }, style];
  const scrollContentStyle = [styles.scrollContent, contentContainerStyle];

  let body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={scrollContentStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentContainerStyle]}>{children}</View>
  );

  if (keyboardAvoid) {
    body = (
      <KeyboardAvoidingView
        style={StyleSheet.absoluteFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return <SafeAreaView style={containerStyle} edges={edges}>{body}</SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
});

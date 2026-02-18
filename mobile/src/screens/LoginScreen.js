import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Image,
} from 'react-native';
import { SafeScreen } from '../components/SafeScreen';
import { theme } from '../theme';
import { loginManager, loginEmployee } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { scheduleWelcomeNotification } from '../services/notifications';

const { colors, spacing, borderRadius, typography, shadows } = theme;

export function LoginScreen() {
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const [role, setRole] = useState('employee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const maxInputWidth = Math.min(width - spacing.xxl * 2, 360);

  const handleLogin = async () => {
    const e = (email || '').trim();
    const p = (password || '').trim();
    if (!e || !p) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      const login = role === 'manager' ? loginManager : loginEmployee;
      const data = await login(e, p);
      if (data.ok && data.user) {
        await signIn(data.user);
        await scheduleWelcomeNotification(data.user.name);
      }
    } catch (err) {
      Alert.alert('Login failed', err.message || 'Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeScreen scroll={false} edges={['top', 'bottom']}>
      <View style={styles.wrapper}>
        <View style={[styles.card, shadows.md]}>
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>TM</Text>
            </View>
            <Text style={styles.title}>Task Manager</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          <View style={[styles.roleRow, { maxWidth: maxInputWidth }]}>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'employee' && styles.roleBtnActive]}
              onPress={() => setRole('employee')}
              activeOpacity={0.8}
            >
              <Text style={[styles.roleBtnText, role === 'employee' && styles.roleBtnTextActive]}>
                Employee
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'manager' && styles.roleBtnActive]}
              onPress={() => setRole('manager')}
              activeOpacity={0.8}
            >
              <Text style={[styles.roleBtnText, role === 'manager' && styles.roleBtnTextActive]}>
                Manager
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.form, { maxWidth: maxInputWidth }]}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Manager: manager@company.com / Manager@123
          </Text>
        </View>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    ...theme.shadows.md,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  roleRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginBottom: spacing.lg,
    width: '100%',
  },
  roleBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  roleBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  roleBtnText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  roleBtnTextActive: {
    color: colors.primary,
  },
  form: {
    width: '100%',
    alignSelf: 'center',
  },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    ...typography.label,
    color: colors.white,
    fontSize: 16,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});

import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, radii, spacing, typography, type TypographyRole } from '../theme/tokens';

export function LayaText({ variant = 'body', style, ...props }: TextProps & { variant?: TypographyRole }) {
  return <Text {...props} style={[styles.text, typography[variant], style]} />;
}

export function Screen({ children, bottomSafeArea = true }: PropsWithChildren<{ bottomSafeArea?: boolean }>) {
  return (
    <SafeAreaView style={styles.screen} edges={bottomSafeArea ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Surface({ tone = 'default', style, ...props }: ViewProps & { tone?: 'default' | 'strong' }) {
  return <View {...props} style={[styles.surface, tone === 'strong' && styles.strongSurface, style]} />;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, busy, accessibilityHint }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && !disabled && (variant === 'primary' ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
      ]}
    >
      <LayaText variant="bodyStrong" style={[
        styles.buttonText,
        variant === 'primary' ? styles.primaryText : styles.secondaryText,
        disabled && styles.disabledText,
      ]}>{label}</LayaText>
    </Pressable>
  );
}

export type StatusTone = keyof typeof colors.status;
const statusLabels: Record<StatusTone, string> = {
  positive: 'Covered', warning: 'Tight', danger: 'At risk', unknown: 'Unknown',
};

export function StatusIndicator({ status }: { status: StatusTone }) {
  const tone = colors.status[status];
  return (
    <View style={[styles.status, { backgroundColor: tone.background }]}>
      <LayaText variant="label" style={{ color: tone.foreground }}>{statusLabels[status]}</LayaText>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, flexShrink: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { width: '100%', maxWidth: layout.contentWidth, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  surface: { padding: spacing.lg, borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  strongSurface: { backgroundColor: colors.surfaceStrong, borderColor: colors.surfaceStrong },
  button: { minHeight: layout.touchTarget, justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderWidth: 1, borderRadius: radii.medium },
  buttonText: { textAlign: 'center' },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.background, borderColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
  secondaryPressed: { backgroundColor: colors.surfaceSubtle },
  primaryText: { color: colors.onStrong },
  secondaryText: { color: colors.primary },
  disabled: { backgroundColor: colors.disabledBackground, borderColor: colors.disabledBackground },
  disabledText: { color: colors.disabledText },
  status: { alignSelf: 'flex-start', borderRadius: radii.small, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, maxWidth: '100%' },
});

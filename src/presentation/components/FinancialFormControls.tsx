import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, layout, radii, spacing, typography } from '../theme/tokens';
import { LayaText } from './primitives';

export function FieldError({ message }: { message?: string }) {
  return message ? <LayaText variant="caption" accessibilityRole="alert" accessibilityLiveRegion="polite"
    style={styles.error}>{message}</LayaText> : null;
}

export function FinancialField({ label, hint, error, suffix, ...props }: TextInputProps & {
  label: string; hint?: string; error?: string; suffix?: string;
}) {
  return <View style={styles.field}>
    <LayaText variant="label">{label}</LayaText>
    {hint ? <LayaText variant="caption" style={styles.hint}>{hint}</LayaText> : null}
    <View style={[styles.inputRow, error ? styles.invalid : undefined]}>
      <TextInput {...props} accessibilityLabel={label} accessibilityHint={error ?? hint}
        accessibilityState={{ disabled: props.editable === false }}
        autoCorrect={false} returnKeyType="done" placeholderTextColor={colors.textSecondary}
        style={[styles.input, props.keyboardType === 'decimal-pad' ? typography.financialBody : undefined]} />
      {suffix ? <LayaText variant="label" style={styles.hint}>{suffix}</LayaText> : null}
    </View>
    <FieldError message={error} />
  </View>;
}

export function FinancialChoice({ label, selected, disabled, onPress }: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label}
    accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && styles.chosen, pressed && styles.pressed]}>
    <LayaText style={styles.mark} accessible={false}>{selected ? '●' : '○'}</LayaText>
    <LayaText style={styles.choiceLabel}>{label}</LayaText>
  </Pressable>;
}
const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  hint: { color: colors.textWarm },
  error: { color: colors.status.danger.foreground },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.textSecondary, borderRadius: radii.medium, backgroundColor: colors.surface },
  invalid: { borderColor: colors.status.danger.foreground },
  input: { ...typography.body, color: colors.text, minHeight: layout.touchTarget, flex: 1, paddingVertical: spacing.md },
  choice: { minHeight: layout.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing.md },
  chosen: { borderColor: colors.primary, backgroundColor: colors.status.positive.background },
  pressed: { backgroundColor: colors.surfaceSubtle },
  mark: { color: colors.primary },
  choiceLabel: { flex: 1 },
});

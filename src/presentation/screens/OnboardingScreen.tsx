import { StyleSheet, View } from 'react-native';

import { Button, LayaText, Screen } from '../components/primitives';
import { colors, radii, spacing } from '../theme/tokens';

type Props = { onComplete: () => void } & (
  { mode?: 'first-launch'; saving: boolean; error: boolean } | { mode: 'review' }
);

export function OnboardingScreen(props: Props) {
  const reviewing = props.mode === 'review';
  const saving = props.mode === 'review' ? false : props.saving;
  const error = props.mode === 'review' ? false : props.error;
  return (
    <Screen>
      {reviewing ? <LayaText variant="heading" accessibilityRole="header">Review how Laya works</LayaText> : null}
      {/* Decorative atmosphere only, never a replacement for the official logo. */}
      <View style={styles.landscape} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.sun} />
        <View style={styles.distantLand} />
        <View style={styles.middleLand} />
        <View style={styles.path} />
        <View style={styles.nearLand} />
      </View>
      <View style={styles.message}>
        <LayaText variant="display" accessibilityRole="header" style={styles.center}>Laya</LayaText>
        <LayaText variant="editorial" style={styles.center}>Your path out of debt.</LayaText>
        <LayaText style={styles.support}>Understand your debts, upcoming obligations, and what your money needs to do next—one step at a time.</LayaText>
      </View>
      {error ? (
        <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
          We couldn’t save your progress. Please try Get Started again.
        </LayaText>
      ) : null}
      <Button label={reviewing ? 'Done reviewing' : 'Get Started'} onPress={props.onComplete} disabled={saving} />
      {saving ? <LayaText accessibilityLiveRegion="polite" style={styles.support}>Saving your progress…</LayaText> : null}
      <LayaText variant="caption" style={styles.support}>Disiplina sa ngayon, Layang bukas.</LayaText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  landscape: { width: '100%', aspectRatio: 1.5, maxHeight: 280, overflow: 'hidden', backgroundColor: colors.surfaceSubtle, borderRadius: radii.surface },
  sun: { position: 'absolute', width: '25%', aspectRatio: 1, borderRadius: 200, backgroundColor: colors.accent, top: '14%', left: '38%' },
  distantLand: { position: 'absolute', width: '125%', height: '65%', borderRadius: 200, backgroundColor: colors.emphasis, left: '-30%', top: '51%', transform: [{ rotate: '-12deg' }] },
  middleLand: { position: 'absolute', width: '135%', height: '68%', borderRadius: 200, backgroundColor: colors.primary, right: '-40%', top: '58%', transform: [{ rotate: '15deg' }] },
  path: { position: 'absolute', width: '65%', height: '90%', borderRadius: 160, backgroundColor: colors.surfaceSubtle, left: '25%', top: '74%', transform: [{ rotate: '-30deg' }] },
  nearLand: { position: 'absolute', width: '105%', height: '60%', borderRadius: 200, backgroundColor: colors.surfaceStrong, left: '-35%', top: '80%', transform: [{ rotate: '10deg' }] },
  message: { gap: spacing.md },
  center: { color: colors.surfaceStrong, textAlign: 'center' },
  support: { color: colors.textWarm, textAlign: 'center' },
  error: { color: colors.status.danger.foreground },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, LayaText, Screen, StatusIndicator, Surface, type StatusTone } from './components/primitives';
import { colors, spacing } from './theme/tokens';

// Visual fixtures only: no domain calculations, product entities, or persistence.
const examples: readonly { name: string; detail: string; status: StatusTone }[] = [
  { name: 'GCash Loan', detail: 'Room in the plan', status: 'positive' },
  { name: 'Internet', detail: 'A little room needed', status: 'warning' },
  { name: 'Tala', detail: 'Worth a closer look', status: 'danger' },
];

export function VisualShowcase() {
  const [previewPressed, setPreviewPressed] = useState(false);
  return (
    <Screen>
      <View style={styles.brandRow}>
        <LayaText variant="display" style={styles.brand}>Laya</LayaText>
        <LayaText variant="caption" style={styles.brandLine}>Your path out of debt.</LayaText>
      </View>

      <View style={styles.section}>
        <LayaText variant="heading" accessibilityRole="header">Magandang araw</LayaText>
        <LayaText style={styles.secondary}>A little clarity for the steps ahead.</LayaText>
      </View>

      <Surface tone="strong" style={styles.hero}>
        <LayaText variant="label" style={styles.onStrong}>Safe to pay today</LayaText>
        <LayaText variant="financialHero" style={styles.onStrong} accessibilityLabel="2,350 Philippine pesos">₱2,350</LayaText>
        <LayaText style={styles.onStrong}>after upcoming essentials</LayaText>
      </Surface>

      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header">What should my next peso do?</LayaText>
        <LayaText style={styles.secondary}>Make room for today, one step at a time.</LayaText>
      </View>

      <View>
        <View style={styles.rowsHeading}>
          <LayaText variant="title" accessibilityRole="header">A clearer picture</LayaText>
          <LayaText variant="caption" style={styles.secondary}>Sample commitments</LayaText>
        </View>
        {examples.map((item) => (
          <View key={item.name} style={styles.row}>
            <View style={styles.rowCopy}>
              <LayaText variant="bodyStrong">{item.name}</LayaText>
              <LayaText variant="caption" style={styles.secondary}>{item.detail}</LayaText>
            </View>
            <StatusIndicator status={item.status} />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Button label="Plan my next peso" onPress={() => setPreviewPressed(true)} accessibilityHint="Shows a message about this design preview" />
        {previewPressed ? (
          <LayaText variant="caption" accessibilityLiveRegion="polite" style={styles.previewMessage}>
            This is a design preview. Your plan will begin here in a future version.
          </LayaText>
        ) : null}
      </View>

      <View style={styles.footer}>
        {/* A quiet path-inspired section accent, not an approximation of the logo. */}
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.pathAccent}>
          <View style={[styles.pathLine, styles.pathFirst]} />
          <View style={[styles.pathLine, styles.pathSecond]} />
          <View style={[styles.pathLine, styles.pathThird]} />
        </View>
        <LayaText variant="editorial" style={styles.sentiment}>Disiplina sa ngayon, Layang bukas.</LayaText>
      </View>
      <LayaText variant="caption" style={styles.disclaimer}>Design preview · All figures are sample data.</LayaText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.lg, rowGap: spacing.xs },
  brand: { color: colors.surfaceStrong },
  brandLine: { color: colors.textWarm },
  section: { gap: spacing.xs },
  secondary: { color: colors.textSecondary },
  hero: { gap: spacing.xs, borderTopWidth: 2, borderTopColor: colors.accent },
  onStrong: { color: colors.onStrong },
  rowsHeading: { gap: spacing.xs, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  rowCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 170 },
  previewMessage: { color: colors.textWarm, textAlign: 'center' },
  footer: { gap: spacing.sm, alignItems: 'center' },
  pathAccent: { width: 72, height: 24, overflow: 'hidden' },
  pathLine: { position: 'absolute', width: 72, height: 32, borderTopWidth: 1, borderTopColor: colors.accent, borderRadius: 36 },
  pathFirst: { top: 4 },
  pathSecond: { top: 10 },
  pathThird: { top: 16 },
  sentiment: { color: colors.surfaceStrong, textAlign: 'center' },
  disclaimer: { color: colors.textSecondary, textAlign: 'center' },
});

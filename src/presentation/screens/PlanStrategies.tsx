import { Pressable, StyleSheet, View } from 'react-native';
import type { PlanStrategies as Scenarios, PlanStrategy } from '../../application/composePlanStrategies';
import type { Money } from '../../domain/Money';
import { LayaText, Surface } from '../components/primitives';
import { formatFinancialDate, formatPHP } from '../formatters/financial';
import { colors, layout, radii, spacing } from '../theme/tokens';

const choices: readonly { id: PlanStrategy; label: string; explanation: string }[] = [
  { id: 'snowball', label: 'Snowball', explanation: 'Orders recorded debts from smaller reported balance to larger reported balance.' },
  { id: 'avalanche', label: 'Avalanche', explanation: 'Orders known interest rates from higher nominal annualized comparison rate to lower, then places unknown rates after known rates.' },
  { id: 'adaptive', label: 'Laya Adaptive', explanation: 'First identifies positive reported balances that individually fit within the current Safe-to-Pay amount, then uses Avalanche ordering for the remaining debts.' },
];
const categoryLabels = {
  'clearable-within-safe-to-pay': 'Fits within current Safe-to-Pay',
  'remaining-avalanche-order': 'Remaining debts in Avalanche order',
};
const spoken = (amount: Money) => formatPHP(amount).replace('₱', '') + ' Philippine pesos';
function SummaryAmount({ label, amount }: { label: string; amount: Money }) {
  return <View accessible accessibilityLabel={`${label}. ${spoken(amount)}.`}>
    <LayaText variant="caption" style={styles.warm}>{label}</LayaText>
    <LayaText variant="financialBody">{formatPHP(amount)}</LayaText>
  </View>;
}

export function PlanStrategies({ scenarios, selected, onSelect }: {
  scenarios: Scenarios; selected: PlanStrategy; onSelect: (strategy: PlanStrategy) => void;
}) {
  const scenario = scenarios[selected];
  const { safeToPay, allocation } = scenario;
  return <View style={styles.section}>
    <Surface style={styles.section}>
      <SummaryAmount label="Safe-to-Pay" amount={safeToPay.amount} />
      <LayaText variant="caption" style={styles.warm}>Protection window: {formatFinancialDate(safeToPay.protectionStartDate)} through {formatFinancialDate(safeToPay.protectionThroughDate)}</LayaText>
      <LayaText variant="caption" style={styles.warm}>Each planning view uses this same amount and protection window.</LayaText>
    </Surface>
    <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Debt strategy</LayaText>
    <View style={styles.selector}>
      {choices.map(choice => <Pressable key={choice.id} accessibilityRole="radio" accessibilityLabel={choice.label}
        accessibilityState={{ checked: selected === choice.id }} onPress={() => onSelect(choice.id)}
        style={({ pressed }) => [styles.choice, selected === choice.id && styles.selected, pressed && styles.pressed]}>
        <LayaText variant="label" style={selected === choice.id ? styles.light : styles.green}>
          {selected === choice.id ? '✓ ' : ''}{choice.label}
        </LayaText>
      </Pressable>)}
    </View>
    <LayaText style={styles.warm}>{choices.find(choice => choice.id === selected)!.explanation}</LayaText>
    {selected === 'adaptive' ? <LayaText variant="caption" style={styles.warm}>Each debt is assessed individually. Several may fit even when their combined balances exceed Safe-to-Pay; the proposed allocation below uses capacity cumulatively.</LayaText> : null}
    <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Proposed extra allocation</LayaText>
    <LayaText variant="caption" style={styles.warm}>Planning only. These are not executed payments and do not change reported debt balances. Full coverage means the proposal equals the reported balance; partial coverage means it covers only part.</LayaText>
    {safeToPay.amount.minorUnits === 0 ? <LayaText>₱0.00 is available under the current protection window. No extra allocation is proposed.</LayaText> : null}
    {scenario.orderedEntries.length === 0 ? <LayaText>Add a debt to explore proposed allocations.</LayaText> : null}
    {allocation.allocations.map(entry => <Surface key={entry.debt.id} style={styles.section} accessible
      accessibilityLabel={`Proposed allocation for ${entry.debt.name}. Reported balance: ${spoken(entry.debt.balance)}. Proposed extra amount: ${spoken(entry.amount)}. ${entry.coverage === 'full' ? 'Full' : 'Partial'} coverage of reported balance.`}>
      <LayaText variant="title" style={styles.green}>{entry.debt.name}</LayaText>
      <LayaText variant="caption" style={styles.warm}>Reported balance · {formatPHP(entry.debt.balance)}</LayaText>
      <LayaText variant="caption" style={styles.warm}>Proposed extra amount</LayaText>
      <LayaText variant="financialBody">{formatPHP(entry.amount)}</LayaText>
      <LayaText variant="caption">{entry.coverage === 'full' ? 'Full' : 'Partial'} coverage of reported balance</LayaText>
    </Surface>)}
    <SummaryAmount label="Total proposed allocation" amount={allocation.totalAllocated} />
    <SummaryAmount label="Unallocated Safe-to-Pay" amount={allocation.remainingSafeToPay} />
    {scenario.orderedEntries.length > 0 ? <>
      <LayaText variant="title" accessibilityRole="header" style={styles.green}>Order in this planning view</LayaText>
      {scenario.orderedEntries.map((entry, index) => <View key={entry.debt.id} style={styles.order} accessible
        accessibilityLabel={`${index + 1}. ${entry.debt.name}.${entry.category ? ` ${categoryLabels[entry.category]}.` : ''}`}>
        <LayaText>{index + 1}. {entry.debt.name}</LayaText>
        {entry.category ? <LayaText variant="caption" style={styles.warm}>{categoryLabels[entry.category]}</LayaText> : null}
      </View>)}
    </> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.md },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minHeight: layout.touchTarget, justifyContent: 'center', padding: spacing.md, borderRadius: radii.medium,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle, flexShrink: 1 },
  selected: { backgroundColor: colors.surfaceStrong, borderColor: colors.surfaceStrong },
  pressed: { opacity: 0.8 },
  order: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  green: { color: colors.surfaceStrong }, warm: { color: colors.textWarm }, light: { color: colors.onStrong },
});

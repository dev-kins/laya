import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listIncome } from '../../application/listIncome';
import type { Income } from '../../domain/Income';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import { formatFinancialDate, formatPHP, formatRecurrence } from '../formatters/financial';
import type { AddStackParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type ReadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; income: readonly Income[] };

function IncomeSummary({ income }: { income: Income }) {
  const amount = formatPHP(income.amount);
  const date = formatFinancialDate(income.date);
  const status = income.status === 'expected' ? 'Expected' : 'Received';
  const recurrence = income.status === 'expected' && income.recurrence !== undefined ? formatRecurrence(income.recurrence) : undefined;
  const spoken = [income.name, amount.replace('₱', '') + ' Philippine pesos', status, date, recurrence]
    .filter(value => value !== undefined).join('. ');
  return <View style={styles.income} accessible accessibilityLabel={spoken}>
    <LayaText variant="title" style={styles.green}>{income.name}</LayaText>
    <LayaText variant="financialBody" style={styles.green}>{amount}</LayaText>
    <LayaText variant="caption">{status} · {date}</LayaText>
    {recurrence === undefined ? null : <LayaText variant="caption">{recurrence}</LayaText>}
  </View>;
}

export function IncomeOverviewScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'IncomeOverview'>) {
  const [state, setState] = useState<ReadState>({ kind: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const current = ++request.current;
    setState({ kind: 'loading' });
    listIncome().then(
      income => { if (current === request.current) setState({ kind: 'ready', income }); },
      () => { if (current === request.current) setState({ kind: 'error' }); },
    );
  }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    // The service still closes its owned connection; late reads cannot update UI.
    return () => { request.current++; };
  }, [refresh]));

  return <Screen bottomSafeArea={false}>
    <Button label="Back to Add" variant="secondary" onPress={() => navigation.popTo('AddHub')} />
    <View style={styles.intro}>
      <LayaText variant="editorial" style={styles.green}>Laya</LayaText>
      <View style={styles.rule} accessible={false} />
      <LayaText variant="display" accessibilityRole="header" style={styles.green}>Mga Kita</LayaText>
      <LayaText style={styles.warm}>A clear view of the income you’ve recorded.</LayaText>
    </View>
    {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Opening your recorded income…</LayaText> : null}
    {state.kind === 'error' ? <>
      <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">We couldn’t read your income on this device. Please try again.</LayaText>
      <Button label="Retry" onPress={refresh} />
    </> : null}
    {state.kind === 'ready' ? <>
      {state.income.length === 0 ? <Surface tone="strong" style={styles.empty}>
        <LayaText variant="editorial" style={styles.light}>Wala pang kitang nakatala.</LayaText>
        <LayaText style={styles.light}>Add income you expect or have already received.</LayaText>
      </Surface> : <>
        <LayaText variant="caption" style={styles.warm}>Shown in a consistent record order, not a priority or forecast.</LayaText>
        {state.income.map(income => <IncomeSummary key={income.id} income={income} />)}
      </>}
      <Button label="Add income" onPress={() => navigation.navigate('AddIncome')} />
    </> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  intro: { gap: spacing.sm, paddingVertical: spacing.sm },
  rule: { width: 40, height: 3, backgroundColor: colors.accent },
  green: { color: colors.surfaceStrong },
  warm: { color: colors.textWarm },
  light: { color: colors.onStrong },
  empty: { gap: spacing.md },
  income: { gap: spacing.sm, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});

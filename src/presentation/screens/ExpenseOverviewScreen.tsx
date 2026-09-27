import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listExpenses } from '../../application/listExpenses';
import type { EssentialObligation } from '../../domain/EssentialObligation';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import { formatFinancialDate, formatPHP, formatRecurrence } from '../formatters/financial';
import type { AddStackParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type ReadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; expense: readonly EssentialObligation[] };

function ExpenseSummary({ expense }: { expense: EssentialObligation }) {
  const amount = formatPHP(expense.amount);
  const date = formatFinancialDate(expense.date);
  const recurrence = expense.recurrence !== undefined ? formatRecurrence(expense.recurrence) : undefined;
  const spoken = [expense.name, amount.replace('₱', '') + ' Philippine pesos', date, recurrence]
    .filter(value => value !== undefined).join('. ');
  return <View style={styles.expense} accessible accessibilityLabel={spoken}>
    <LayaText variant="title" style={styles.green}>{expense.name}</LayaText>
    <LayaText variant="financialBody" style={styles.green}>{amount}</LayaText>
    <LayaText variant="caption">{date}</LayaText>
    {recurrence === undefined ? null : <LayaText variant="caption">{recurrence}</LayaText>}
  </View>;
}

export function ExpenseOverviewScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'ExpenseOverview'>) {
  const [state, setState] = useState<ReadState>({ kind: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const current = ++request.current;
    setState({ kind: 'loading' });
    listExpenses().then(
      expense => { if (current === request.current) setState({ kind: 'ready', expense }); },
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
      <LayaText variant="display" accessibilityRole="header" style={styles.green}>Mga Gastusin</LayaText>
      <LayaText style={styles.warm}>A clear view of the essential expenses you’ve recorded.</LayaText>
    </View>
    {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Opening your recorded expenses…</LayaText> : null}
    {state.kind === 'error' ? <>
      <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">We couldn’t read your expenses on this device. Please try again.</LayaText>
      <Button label="Retry" onPress={refresh} />
    </> : null}
    {state.kind === 'ready' ? <>
      {state.expense.length === 0 ? <Surface tone="strong" style={styles.empty}>
        <LayaText variant="editorial" style={styles.light}>Wala pang gastusing nakatala.</LayaText>
        <LayaText style={styles.light}>Add the non-debt obligations you want to protect.</LayaText>
      </Surface> : <>
        <LayaText variant="caption" style={styles.warm}>Shown in a consistent record order, not a priority or forecast.</LayaText>
        {state.expense.map(expense => <ExpenseSummary key={expense.id} expense={expense} />)}
      </>}
      <Button label="Add expense" onPress={() => navigation.navigate('AddExpense')} />
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
  expense: { gap: spacing.sm, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});

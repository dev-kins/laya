import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listDebts } from '../../application/listDebts';
import type { Debt } from '../../domain/Debt';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import { formatFinancialDate, formatInterest, formatPHP, formatRecurrence } from '../formatters/debt';
import type { AddStackParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type ReadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; debts: readonly Debt[] };

function DebtSummary({ debt }: { debt: Debt }) {
  const balance = formatPHP(debt.balance);
  const payment = debt.scheduledPayment === undefined ? undefined : formatPHP(debt.scheduledPayment);
  const due = debt.nextDueDate === undefined ? undefined : formatFinancialDate(debt.nextDueDate);
  const recurrence = debt.recurrence === undefined ? undefined : formatRecurrence(debt.recurrence);
  const interest = formatInterest(debt.interest);
  const spoken = [debt.name, debt.provider ? `Provider: ${debt.provider}` : undefined,
    `Current reported balance: ${balance.replace('₱', '')} Philippine pesos`,
    payment === undefined ? undefined : `Regular payment: ${payment.replace('₱', '')} Philippine pesos`,
    due === undefined ? undefined : `Next due date: ${due}`,
    recurrence, `Interest: ${interest}`].filter(value => value !== undefined).join('. ');
  return <View style={styles.debt} accessible accessibilityLabel={spoken}>
    <LayaText variant="title" style={styles.green}>{debt.name}</LayaText>
    {debt.provider === undefined ? null : <LayaText variant="caption" style={styles.warm}>{debt.provider}</LayaText>}
    <View style={styles.balance}>
      <LayaText variant="caption" style={styles.warm}>Current reported balance</LayaText>
      <LayaText variant="financialBody" style={styles.green}>{balance}</LayaText>
    </View>
    {payment === undefined ? null : <LayaText variant="caption">Regular payment · {payment}</LayaText>}
    {due === undefined ? null : <LayaText variant="caption">Next due date · {due}</LayaText>}
    {recurrence === undefined ? null : <LayaText variant="caption">{recurrence}</LayaText>}
    <LayaText variant="caption" style={styles.warm}>{interest}</LayaText>
  </View>;
}

export function DebtOverviewScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'DebtOverview'>) {
  const [state, setState] = useState<ReadState>({ kind: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const current = ++request.current;
    setState({ kind: 'loading' });
    listDebts().then(
      debts => { if (current === request.current) setState({ kind: 'ready', debts }); },
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
      <LayaText variant="display" accessibilityRole="header" style={styles.green}>Mga Utang</LayaText>
      <LayaText style={styles.warm}>A clear view of the debts you’ve recorded.</LayaText>
    </View>
    {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Opening your recorded debts…</LayaText> : null}
    {state.kind === 'error' ? <>
      <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">We couldn’t read your debts on this device. Please try again.</LayaText>
      <Button label="Retry" onPress={refresh} />
    </> : null}
    {state.kind === 'ready' ? <>
      {state.debts.length === 0 ? <Surface tone="strong" style={styles.empty}>
        <LayaText variant="editorial" style={styles.light}>Wala pang utang na nakatala.</LayaText>
        <LayaText style={styles.light}>The debts you choose to record will appear here. Start with what you know.</LayaText>
      </Surface> : <>
        <LayaText variant="caption" style={styles.warm}>Shown in a consistent order, not a payment priority.</LayaText>
        {state.debts.map(debt => <DebtSummary key={debt.id} debt={debt} />)}
      </>}
      <Button label="Add a debt" onPress={() => navigation.navigate('AddDebt')} />
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
  debt: { gap: spacing.sm, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  balance: { gap: spacing.xs, paddingVertical: spacing.xs },
});

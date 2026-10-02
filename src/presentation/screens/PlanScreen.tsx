import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadPlan, type PlanResult } from '../../application/loadPlan';
import type { Debt } from '../../domain/Debt';
import type { Money } from '../../domain/Money';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import { formatFinancialDate, formatInterest, formatPHP } from '../formatters/financial';
import type { MainTabParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; result: PlanResult };
const spokenPHP = (money: Money) => formatPHP(money).replace('-', 'minus ').replace('₱', '') + ' Philippine pesos';
function Amount({ label, amount }: { label: string; amount: Money }) {
  return <View style={styles.section} accessible accessibilityLabel={`${label}. ${spokenPHP(amount)}.`}>
    <LayaText variant="caption" style={styles.warm}>{label}</LayaText>
    <LayaText variant="financialBody">{formatPHP(amount)}</LayaText>
  </View>;
}
function DebtSummary({ debt }: { debt: Debt }) {
  const interest = formatInterest(debt.interest);
  return <View style={styles.debt} accessible
    accessibilityLabel={`${debt.name}. ${debt.provider ? `Provider: ${debt.provider}. ` : ''}Current reported balance: ${spokenPHP(debt.balance)}. Interest: ${interest}.`}>
    <LayaText variant="title" style={styles.green}>{debt.name}</LayaText>
    {debt.provider === undefined ? null : <LayaText style={styles.warm}>{debt.provider}</LayaText>}
    <LayaText variant="caption" style={styles.warm}>Current reported balance</LayaText>
    <LayaText variant="financialBody">{formatPHP(debt.balance)}</LayaText>
    <LayaText variant="caption" style={styles.warm}>{interest}</LayaText>
  </View>;
}

export function PlanScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'Plan'>) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const current = ++request.current;
    setState({ kind: 'loading' });
    loadPlan().then(
      result => { if (current === request.current) setState({ kind: 'ready', result }); },
      () => { if (current === request.current) setState({ kind: 'error' }); },
    );
  }, []);
  useFocusEffect(useCallback(() => { refresh(); return () => { request.current++; }; }, [refresh]));
  const result = state.kind === 'ready' ? state.result : null;
  return <Screen bottomSafeArea={false}>
    <View style={styles.section}>
      <LayaText variant="editorial" style={styles.green}>Laya</LayaText>
      <View style={styles.rule} accessible={false} />
      <LayaText variant="display" accessibilityRole="header" style={styles.green}>Plan</LayaText>
      <LayaText style={styles.warm}>A clear picture of what you’ve recorded.</LayaText>
    </View>
    {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Building your planning overview…</LayaText> : null}
    {state.kind === 'error' ? <>
      <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">We couldn’t build your planning overview from the data on this device. Please try again.</LayaText>
      <Button label="Retry" onPress={refresh} />
    </> : null}
    {result ? <>
      <Surface tone="strong" style={styles.section} accessible
        accessibilityLabel={`Debt picture. Total reported debt: ${spokenPHP(result.totalReportedDebt)}. Recorded debts: ${result.recordedDebtCount}.`}>
        <LayaText variant="editorial" style={styles.light}>Debt picture</LayaText>
        <LayaText variant="caption" style={styles.light}>Total reported debt</LayaText>
        <LayaText variant="financialHero" style={styles.light}>{formatPHP(result.totalReportedDebt)}</LayaText>
        <LayaText style={styles.light}>Recorded debts · {result.recordedDebtCount}</LayaText>
      </Surface>
      <LayaText variant="caption" style={styles.warm}>Recorded debt balances are user-reported snapshots. Laya does not subtract recorded payment history from those balances automatically.</LayaText>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>60-day debt schedule</LayaText>
        <LayaText variant="caption" style={styles.warm}>After {formatFinancialDate(result.startDate)} through {formatFinancialDate(result.through)}</LayaText>
        <Amount label="Scheduled debt dues" amount={result.totalScheduledDues} />
        <LayaText accessibilityLabel={`Scheduled debt-due events: ${result.scheduledDueCount}.`}>Due events · {result.scheduledDueCount}</LayaText>
        <LayaText variant="caption" style={styles.warm}>Scheduled amounts in this window, not a payoff total.</LayaText>
      </View>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Recorded payments</LayaText>
        <LayaText accessibilityLabel={`Recorded payment records: ${result.recordedPaymentCount}.`}>Payment records · {result.recordedPaymentCount}</LayaText>
        <LayaText variant="caption" style={styles.warm}>Separate historical records, not a measure of payoff progress.</LayaText>
      </View>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Planning context</LayaText>
        {result.context.kind === 'missing-available-money' ? <>
          <LayaText>Set Available Money to see your 60-day projection. Your recorded debt facts are shown above and below.</LayaText>
          <Button label="Set available money" onPress={() => navigation.navigate('Add', { screen: 'AvailableMoney', initial: false })} />
        </> : <>
          <Amount label="Available now" amount={result.context.availableMoney} />
          <Amount label="Safe-to-Pay" amount={result.context.safeToPay.amount} />
          <Amount label="Lowest projected" amount={result.context.lowestProjected} />
          <Amount label="Ending projected" amount={result.context.endingProjected} />
          <LayaText variant="caption" style={styles.warm}>Based on recorded information for the next 60 days. A planning estimate, not a bank balance, guarantee or recommendation to put this amount toward debt.</LayaText>
          <Button label="Update available money" variant="secondary" onPress={() => navigation.navigate('Add', { screen: 'AvailableMoney', initial: false })} />
        </>}
        <LayaText variant="caption" style={styles.warm}>Today’s events are excluded from this window. Recorded payments do not cancel scheduled dues; forecasts may need updating.</LayaText>
        <Button label="View timeline" variant="secondary" onPress={() => navigation.navigate('Timeline')} />
      </View>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Your debts</LayaText>
        {result.recordedDebtCount === 0 ? <LayaText>No debts recorded yet.</LayaText> : <>
          <LayaText variant="caption" style={styles.warm}>Shown in a consistent order, not a payment priority.</LayaText>
          {result.debts.map(debt => <DebtSummary key={debt.id} debt={debt} />)}
          <Button label="View debts" variant="secondary" onPress={() => navigation.navigate('Add', { screen: 'DebtOverview', initial: false })} />
        </>}
        <Button label="Add debt" onPress={() => navigation.navigate('Add', { screen: 'AddDebt', initial: false })} />
      </View>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Debt strategy</LayaText>
        <LayaText>{result.recordedDebtCount === 0 ? 'Recorded debts will provide a starting point for a future payoff plan.' : 'Your recorded debts are available for a future payoff plan.'}</LayaText>
        <LayaText variant="caption" style={styles.warm}>No payoff strategy or payment priority is selected here.</LayaText>
      </View>
    </> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  rule: { width: 40, height: 3, backgroundColor: colors.accent },
  debt: { gap: spacing.xs, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  green: { color: colors.surfaceStrong }, warm: { color: colors.textWarm }, light: { color: colors.onStrong },
});

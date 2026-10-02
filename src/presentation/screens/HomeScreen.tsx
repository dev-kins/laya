import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadHome, type HomeResult } from '../../application/loadHome';
import type { TimelineEntry } from '../../application/loadTimeline';
import type { Money } from '../../domain/Money';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import { formatFinancialDate, formatPHP } from '../formatters/financial';
import type { MainTabParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type State = { kind: 'loading' } | { kind: 'error' } | HomeResult;
const spokenPHP = (amount: Money) => formatPHP(amount).replace('-', 'minus ').replace('₱', '') + ' Philippine pesos';

function Upcoming({ entry }: { entry: TimelineEntry }) {
  const { event, sourceName, label } = entry;
  return <Surface style={styles.upcoming} accessible
    accessibilityLabel={`${formatFinancialDate(event.date)}. ${sourceName}. ${label}. ${spokenPHP(event.amount)} ${event.direction}.`}>
    <LayaText variant="caption" style={styles.warm}>{formatFinancialDate(event.date)}</LayaText>
    <LayaText variant="title" style={styles.green}>{sourceName}</LayaText>
    <LayaText variant="caption" style={styles.warm}>{label} · {event.direction === 'inflow' ? 'Inflow' : 'Outflow'}</LayaText>
    <LayaText variant="financialBody">{event.direction === 'inflow' ? '+' : '−'}{formatPHP(event.amount)}</LayaText>
  </Surface>;
}

function OutlookValue({ label, amount }: { label: string; amount: Money }) {
  return <View style={styles.outlookValue} accessible accessibilityLabel={`${label}. ${spokenPHP(amount)}.`}>
    <LayaText variant="caption" style={styles.warm}>{label}</LayaText>
    <LayaText variant="financialBody">{formatPHP(amount)}</LayaText>
  </View>;
}

export function HomeScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'Home'>) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const current = ++request.current;
    setState({ kind: 'loading' });
    loadHome().then(
      result => { if (current === request.current) setState(result); },
      () => { if (current === request.current) setState({ kind: 'error' }); },
    );
  }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    return () => { request.current++; };
  }, [refresh]));
  const openAvailableMoney = () => navigation.navigate('Add', { screen: 'AvailableMoney', initial: false });

  return <Screen bottomSafeArea={false}>
    <View style={styles.brandRow}>
      <LayaText variant="display" style={styles.green}>Laya</LayaText>
      <LayaText variant="caption" style={styles.warm}>Your path out of debt.</LayaText>
    </View>
    <View style={styles.section}>
      <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Your financial outlook</LayaText>
      <LayaText style={styles.warm}>A little clarity for the steps ahead.</LayaText>
    </View>
    {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Building your financial outlook…</LayaText> : null}
    {state.kind === 'error' ? <>
      <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">We couldn’t build your financial outlook from the data on this device. Please try again.</LayaText>
      <Button label="Retry" onPress={refresh} />
    </> : null}
    {state.kind === 'missing-available-money' ? <>
      <Surface tone="strong" style={styles.hero}>
        <LayaText variant="editorial" style={styles.light}>Start with what you have</LayaText>
        <LayaText style={styles.light}>Add the money you currently have available so Laya can build your financial outlook.</LayaText>
      </Surface>
      <Button label="Set available money" onPress={openAvailableMoney} />
    </> : null}
    {state.kind === 'ready' ? <>
      <Surface tone="strong" style={styles.hero} accessible
        accessibilityLabel={`Safe-to-Pay. ${spokenPHP(state.safeToPay.amount)}. Based on recorded financial information over the next 60 days, from ${formatFinancialDate(state.safeToPay.protectionStartDate)} through ${formatFinancialDate(state.safeToPay.protectionThroughDate)}. A planning estimate, not a guarantee.`}>
        <LayaText variant="title" style={styles.light}>Safe-to-Pay</LayaText>
        <LayaText variant="financialHero" style={styles.light}>{formatPHP(state.safeToPay.amount)}</LayaText>
        <LayaText variant="caption" style={styles.light}>Based on the financial information you’ve recorded for the next 60 days.</LayaText>
      </Surface>
      <View style={styles.available}>
        <View style={styles.section} accessible accessibilityLabel={`Available now. ${spokenPHP(state.availableMoney)}. Manually reported money.`}>
          <LayaText variant="bodyStrong" style={styles.green}>Available now</LayaText>
          <LayaText variant="financialBody">{formatPHP(state.availableMoney)}</LayaText>
          <LayaText variant="caption" style={styles.warm}>The money you’ve reported, before projected events.</LayaText>
        </View>
        <Button label="Update available money" variant="secondary" onPress={openAvailableMoney} />
      </View>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Up next</LayaText>
        {state.nextEvent ? <Upcoming entry={state.nextEvent} /> : <LayaText style={styles.warm}>No scheduled items recorded in Laya for the next 60 days.</LayaText>}
      </View>
      <View style={styles.section}>
        <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>60-day outlook</LayaText>
        <LayaText variant="caption" style={styles.warm}>Starting {formatFinancialDate(state.safeToPay.protectionStartDate)} · Through {formatFinancialDate(state.safeToPay.protectionThroughDate)}</LayaText>
        <View style={styles.outlook}>
          <OutlookValue label="Lowest projected" amount={state.lowestProjected} />
          <OutlookValue label="Ending projected" amount={state.endingProjected} />
        </View>
      </View>
      <Button label="View timeline" onPress={() => navigation.navigate('Timeline')} />
      <LayaText variant="caption" style={styles.warm}>A planning estimate, not a bank balance, guarantee or recommendation. Missing or outdated income and obligations can change this outlook.</LayaText>
      <LayaText variant="caption" style={styles.warm}>Today’s events and recorded receipts or payments aren’t replayed. Expected income and scheduled dues may still need updating.</LayaText>
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  section: { gap: spacing.sm },
  hero: { gap: spacing.sm, borderTopWidth: 2, borderTopColor: colors.accent, paddingVertical: spacing.xl },
  available: { gap: spacing.md, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  upcoming: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.accent },
  outlook: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingVertical: spacing.md },
  outlookValue: { flexGrow: 1, flexShrink: 1, flexBasis: 180, gap: spacing.xs },
  green: { color: colors.surfaceStrong }, warm: { color: colors.textWarm }, light: { color: colors.onStrong },
});

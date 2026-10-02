import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadTimeline, type TimelineEntry, type TimelineResult } from '../../application/loadTimeline';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import { formatFinancialDate, formatPHP } from '../formatters/financial';
import type { MainTabParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type State = { kind: 'loading' } | { kind: 'error' } | TimelineResult;
const spokenPHP = (formatted: string) => formatted.replace('-', 'minus ').replace('₱', '') + ' Philippine pesos';

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { event, sourceName, label, balanceAfter } = entry;
  const amount = formatPHP(event.amount);
  const balance = formatPHP(balanceAfter);
  const spoken = `${formatFinancialDate(event.date)}. ${sourceName}. ${label}. ${spokenPHP(amount)} ${event.direction}. Projected balance ${spokenPHP(balance)}.`;
  return <View style={styles.row} accessible accessibilityLabel={spoken}>
    <LayaText variant="caption" style={styles.warm}>{label} · {event.direction === 'inflow' ? 'Inflow' : 'Outflow'}</LayaText>
    <LayaText variant="title" style={styles.green}>{sourceName}</LayaText>
    <LayaText variant="financialBody" style={styles.green}>{event.direction === 'inflow' ? '+' : '−'}{amount}</LayaText>
    <LayaText variant="caption" style={styles.warm}>Projected balance after this event</LayaText>
    <LayaText variant="financialBody">{balance}</LayaText>
  </View>;
}

export function TimelineScreen({ navigation }: BottomTabScreenProps<MainTabParamList, 'Timeline'>) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const request = useRef(0);
  const refresh = useCallback(() => {
    const current = ++request.current;
    setState({ kind: 'loading' });
    loadTimeline().then(
      result => { if (current === request.current) setState(result); },
      () => { if (current === request.current) setState({ kind: 'error' }); },
    );
  }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    return () => { request.current++; };
  }, [refresh]));

  return <Screen bottomSafeArea={false}>
    <View style={styles.intro}>
      <LayaText variant="editorial" style={styles.green}>Laya</LayaText>
      <View style={styles.rule} accessible={false} />
      <LayaText variant="display" accessibilityRole="header" style={styles.green}>Timeline</LayaText>
      <LayaText style={styles.warm}>A look at the next 60 days, one scheduled step at a time.</LayaText>
    </View>
    {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Building your timeline…</LayaText> : null}
    {state.kind === 'error' ? <>
      <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">We couldn’t build your timeline from the data on this device. Please try again.</LayaText>
      <Button label="Retry" onPress={refresh} />
    </> : null}
    {state.kind === 'missing-available-money' ? <>
      <Surface tone="strong" style={styles.section}>
        <LayaText variant="editorial" style={styles.light}>Start with what you have</LayaText>
        <LayaText style={styles.light}>Add the money you currently have available so Laya can build your financial timeline.</LayaText>
      </Surface>
      <Button label="Set available money" onPress={() => navigation.navigate('Add', { screen: 'AvailableMoney', initial: false })} />
    </> : null}
    {state.kind === 'ready' ? <>
      <Surface tone="strong" style={styles.section} accessible
        accessibilityLabel={`Starting snapshot. ${formatFinancialDate(state.projection.start.date)}. Available now ${spokenPHP(formatPHP(state.projection.start.balance))}. Manually reported.`}>
        <LayaText variant="caption" style={styles.light}>STARTING SNAPSHOT · {formatFinancialDate(state.projection.start.date)}</LayaText>
        <LayaText style={styles.light}>Available now</LayaText>
        <LayaText variant="financialBody" style={styles.light}>{formatPHP(state.projection.start.balance)}</LayaText>
        <LayaText variant="caption" style={styles.light}>Manually reported money for your plan.</LayaText>
      </Surface>
      <LayaText variant="caption" style={styles.warm}>After {formatFinancialDate(state.projection.start.date)} through {formatFinancialDate(state.projection.through)}</LayaText>
      <LayaText variant="caption" style={styles.warm}>Today’s events and recorded receipts or payments aren’t replayed. Expected income and scheduled dues may still need updating.</LayaText>
      {state.groups.length === 0 ? <View style={styles.section}>
        <LayaText variant="editorial" style={styles.green}>No scheduled items in this window</LayaText>
        <LayaText>Laya has no upcoming forecast events recorded for these 60 days.</LayaText>
      </View> : state.groups.map(group => <View key={group.date.toString()} style={styles.group}>
        <LayaText variant="heading" accessibilityRole="header" style={styles.green}>{formatFinancialDate(group.date)}</LayaText>
        <View style={styles.path}>{group.entries.map(entry => <TimelineRow key={entry.event.id} entry={entry} />)}</View>
      </View>)}
      <LayaText variant="caption" style={styles.warm}>A scenario based on your recorded plans, not a bank balance or a guarantee.</LayaText>
    </> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm, paddingVertical: spacing.sm },
  section: { gap: spacing.sm },
  rule: { width: 40, height: 3, backgroundColor: colors.accent },
  green: { color: colors.surfaceStrong }, warm: { color: colors.textWarm }, light: { color: colors.onStrong },
  group: { gap: spacing.sm, paddingTop: spacing.md },
  path: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.lg },
  row: { gap: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});

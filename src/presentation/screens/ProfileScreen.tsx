import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import appConfig from '../../../app.json';
import { Button, LayaText, Screen, Surface } from '../components/primitives';
import type { MainTabParamList, RootStackParamList } from '../navigation/routes';
import { colors, spacing } from '../theme/tokens';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList, 'MainTabs'>>;

export function ProfileScreen({ navigation }: Props) {
  return <Screen bottomSafeArea={false}>
    <LayaText variant="editorial" style={styles.green}>Laya</LayaText>
    <View style={styles.section}>
      <View style={styles.rule} accessible={false} />
      <LayaText variant="display" accessibilityRole="header" style={styles.green}>Your Laya</LayaText>
      <LayaText style={styles.warm}>Your local setup, and a little guidance for the path ahead.</LayaText>
    </View>
    <Surface style={styles.section}>
      <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Financial setup</LayaText>
      <LayaText>The money you currently have available to use for your financial plan.</LayaText>
      <Button label="Available Money" onPress={() => navigation.navigate('Add', { screen: 'AvailableMoney', initial: false })} />
      <LayaText variant="caption" style={styles.warm}>V1 currency · Philippine Peso (PHP)</LayaText>
    </Surface>
    <View style={styles.section}>
      <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>How Laya calculates</LayaText>
      <LayaText variant="title" accessibilityRole="header">Safe-to-Pay</LayaText>
      <LayaText>Safe-to-Pay estimates how much could be removed from your current Available Money without the recorded projection falling below PHP 0. If the projection already falls below zero, Safe-to-Pay is zero; that does not remove the shortfall.</LayaText>
      <LayaText variant="title" accessibilityRole="header">60-day protection window</LayaText>
      <LayaText>Home, Timeline and Plan look ahead 60 calendar days from the local date when loaded. Today is the starting snapshot; projected events run from tomorrow through day 60, inclusive.</LayaText>
      <LayaText variant="title" accessibilityRole="header">Plan strategies</LayaText>
      <LayaText>Snowball orders smaller reported balances first.</LayaText>
      <LayaText>Avalanche orders known interest from higher nominal annualized comparison rate to lower, with unknown rates after known rates. This comparison does not calculate accrued or compounded interest.</LayaText>
      <LayaText>Laya Adaptive puts positive reported balances that individually fit within Safe-to-Pay first, then uses Avalanche ordering for the remaining debts. Several debts may individually fit even when their combined balances exceed that amount.</LayaText>
      <LayaText variant="caption" style={styles.warm}>These are alternative planning views using the same Safe-to-Pay amount. Proposed allocations do not execute payments or change recorded balances.</LayaText>
    </View>
    <View style={styles.divided}>
      <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Guidance</LayaText>
      <LayaText>Revisit Laya’s introduction. Your setup and financial records stay as they are.</LayaText>
      <Button label="Review how Laya works" variant="secondary" onPress={() => navigation.navigate('OnboardingReview')} />
    </View>
    <View style={styles.divided}>
      <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>Privacy &amp; data</LayaText>
      <LayaText>Your financial records are stored locally on this device. V1 does not require a Laya cloud account, connect to bank accounts, or automatically sync financial records to a Laya cloud service.</LayaText>
    </View>
    <View style={styles.divided}>
      <LayaText variant="editorial" accessibilityRole="header" style={styles.green}>About Laya</LayaText>
      <LayaText>Laya helps you see upcoming financial obligations, understand your projected cash flow, and explore debt-payment planning scenarios using the financial information you record.</LayaText>
      <LayaText variant="caption" style={styles.warm}>Version {appConfig.expo.version}</LayaText>
      <LayaText variant="caption" style={styles.warm}>Calculations depend on the records you enter. Missing or outdated information can change the results. Laya is for planning and information, not financial advice, a bank-verified balance or a guarantee.</LayaText>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  divided: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xl },
  rule: { width: 40, height: 3, backgroundColor: colors.accent },
  green: { color: colors.surfaceStrong },
  warm: { color: colors.textWarm },
});

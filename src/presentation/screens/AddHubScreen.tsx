import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, LayaText, Screen } from '../components/primitives';
import type { AddStackParamList } from '../navigation/routes';
import { colors, layout, radii, spacing } from '../theme/tokens';

export function AddHubScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'AddHub'>) {
  return <Screen bottomSafeArea={false}>
    <LayaText variant="editorial" style={styles.brand}>Laya</LayaText>
    <View style={styles.intro}>
      <View style={styles.rule} accessible={false} />
      <LayaText variant="display" accessibilityRole="header">Idagdag sa Laya</LayaText>
      <LayaText style={styles.support}>What would you like to add? Start with what you know. You can leave the rest for later.</LayaText>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Utang — Add a debt"
      accessibilityHint="Open the debt form" onPress={() => navigation.navigate('AddDebt')}
      style={({ pressed }) => [styles.debt, pressed && styles.pressed]}>
      <LayaText variant="caption" style={styles.gold}>01 · YOUR DEBTS</LayaText>
      <LayaText variant="editorial" style={styles.light}>Utang</LayaText>
      <LayaText style={styles.light}>Keep a clear record of what’s left to pay.</LayaText>
      <LayaText variant="bodyStrong" style={styles.light}>Add a debt →</LayaText>
    </Pressable>
    <Button label="View my debts" variant="secondary" onPress={() => navigation.navigate('DebtOverview')} />
    <Pressable accessibilityRole="button" accessibilityLabel="Kita — Add income"
      accessibilityHint="Open the income form" onPress={() => navigation.navigate('AddIncome')}
      style={({ pressed }) => [styles.income, pressed && styles.incomePressed]}>
      <LayaText variant="caption" style={styles.support}>02 · YOUR INCOME</LayaText>
      <LayaText variant="editorial" style={styles.brand}>Kita</LayaText>
      <LayaText style={styles.support}>Money you expect or have received.</LayaText>
      <LayaText variant="bodyStrong" style={styles.brand}>Add income →</LayaText>
    </Pressable>
    <Button label="View my income" variant="secondary" onPress={() => navigation.navigate('IncomeOverview')} />
    <Pressable accessibilityRole="button" accessibilityLabel="Essential expense — Add expense"
      accessibilityHint="Open the essential expense form" onPress={() => navigation.navigate('AddExpense')}
      style={({ pressed }) => [styles.income, pressed && styles.incomePressed]}>
      <LayaText variant="caption" style={styles.support}>03 · ESSENTIAL EXPENSES</LayaText>
      <LayaText variant="editorial" style={styles.brand}>Pangunahing gastusin</LayaText>
      <LayaText style={styles.support}>The everyday needs you protect.</LayaText>
      <LayaText variant="bodyStrong" style={styles.brand}>Add expense →</LayaText>
    </Pressable>
    <Button label="View my expenses" variant="secondary" onPress={() => navigation.navigate('ExpenseOverview')} />
    <View style={styles.income}>
      <LayaText variant="editorial" style={styles.brand}>Available money</LayaText>
      <LayaText style={styles.support}>Money you currently have available for your plan.</LayaText>
      <Button label="Set available money" variant="secondary" onPress={() => navigation.navigate('AvailableMoney')} />
    </View>
    <LayaText variant="caption" style={styles.support}>Saved on this device. No bank connection needed.</LayaText>
  </Screen>;
}
const styles = StyleSheet.create({
  brand: { color: colors.surfaceStrong },
  intro: { gap: spacing.sm, paddingVertical: spacing.sm },
  rule: { width: 40, height: 3, backgroundColor: colors.accent },
  support: { color: colors.textWarm },
  debt: { minHeight: layout.touchTarget, padding: spacing.xl, gap: spacing.sm, backgroundColor: colors.surfaceStrong, borderRadius: radii.surface },
  pressed: { backgroundColor: colors.primary },
  income: { minHeight: layout.touchTarget, paddingVertical: spacing.lg, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  incomePressed: { backgroundColor: colors.surfaceSubtle },
  gold: { color: colors.accent },
  light: { color: colors.onStrong },
});

import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAddIncomeOperation } from '../../application/addIncome';
import { IncomeFormError, emptyIncomeForm, type IncomeForm, type IncomeFormErrors } from '../../application/incomeForm';
import { FinancialChoice, FinancialField, FieldError } from '../components/FinancialFormControls';
import { Button, LayaText } from '../components/primitives';
import type { AddStackParamList } from '../navigation/routes';
import { colors, layout, spacing } from '../theme/tokens';

export function AddIncomeScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'AddIncome'>) {
  const [form, setForm] = useState<IncomeForm>({ ...emptyIncomeForm });
  const [errors, setErrors] = useState<IncomeFormErrors>({});
  const [failure, setFailure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveIncome] = useState(() => createAddIncomeOperation());
  const busy = useRef(false);
  const mounted = useRef(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Finish the owned write before letting back/gesture discard this form session.
  usePreventRemove(saving, () => {});

  function update<K extends keyof IncomeForm>(key: K, value: IncomeForm[K]) {
    setForm(current => ({ ...current, [key]: value,
      ...(key === 'status' && value === 'received' ? { recurrence: 'none' as const, firstDay: '', secondDay: '' } : {}),
    }));
    setErrors(current => ({ ...current, [key]: undefined,
      ...(key === 'status' ? { recurrence: undefined, firstDay: undefined, secondDay: undefined } : {}),
      ...(key === 'recurrence' ? { firstDay: undefined, secondDay: undefined } : {}),
    }));
    setFailure(false);
  }
  async function submit() {
    if (busy.current || saved) return;
    busy.current = true;
    setSaving(true);
    setErrors({});
    setFailure(false);
    Keyboard.dismiss();
    let completed = false;
    try {
      await saveIncome(form);
      completed = true;
      if (mounted.current) { setSaved(true); scroll.current?.scrollTo({ y: 0, animated: false }); }
    } catch (error) {
      if (mounted.current) {
        if (error instanceof IncomeFormError) setErrors(error.fields);
        else setFailure(true);
        scroll.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      busy.current = completed;
      if (mounted.current) setSaving(false);
    }
  }
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          {saved ? <>
            <LayaText variant="editorial" style={styles.green}>Laya</LayaText>
            <View style={styles.success}>
              <LayaText variant="caption" style={styles.gold}>SA ISANG HAKBANG</LayaText>
              <LayaText variant="display" accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.light}>Kita saved</LayaText>
              <LayaText style={styles.light}>Your income is recorded on this device. One clear step toward seeing the whole picture.</LayaText>
            </View>
            <Button label="View my income" onPress={() => navigation.popTo('IncomeOverview')} />
            <Button label="Done" variant="secondary" onPress={() => navigation.goBack()} />
          </> : <>
            <Button label="Back" variant="secondary" disabled={saving} onPress={() => navigation.goBack()} />
            <View style={styles.section}>
              <LayaText variant="caption" style={styles.warm}>KITA · A CLEARER PICTURE</LayaText>
              <LayaText variant="display" accessibilityRole="header">Magdagdag ng kita</LayaText>
              <LayaText style={styles.warm}>Record income you expect or have already received.</LayaText>
            </View>
            {Object.values(errors).some(Boolean) ? <FieldError message="Please review the fields below." /> : null}
            {failure ? <FieldError message="We couldn’t save this income on your device. Your entries are still here. Please try again." /> : null}
            <FinancialField label="Income name" placeholder="e.g. Salary" value={form.name}
              onChangeText={value => update('name', value)} error={errors.name} editable={!saving} />
            <FinancialField label="Amount (PHP)" suffix="PHP" placeholder="0.00" keyboardType="decimal-pad"
              hint="Use a decimal point, without commas or a currency symbol."
              value={form.amount} onChangeText={value => update('amount', value)} error={errors.amount} editable={!saving} />
            <FinancialField label="Income date" hint="YYYY-MM-DD · the expected date or actual receipt date." placeholder="YYYY-MM-DD"
              autoCapitalize="none" value={form.date} onChangeText={value => update('date', value)} error={errors.date} editable={!saving} />
            <View style={styles.section}>
              <LayaText variant="title" accessibilityRole="header">Expected or received?</LayaText>
              <LayaText variant="caption" style={styles.warm}>Expected is money you expect to receive. Received is money that has already arrived.</LayaText>
              <FinancialChoice label="Expected" selected={form.status === 'expected'} disabled={saving} onPress={() => update('status', 'expected')} />
              <FinancialChoice label="Received" selected={form.status === 'received'} disabled={saving} onPress={() => update('status', 'received')} />
              <FieldError message={errors.status} />
            </View>
            {form.status === 'expected' ? <View style={[styles.section, styles.divider]}>
              <LayaText variant="editorial" accessibilityRole="header">Repeats (optional)</LayaText>
              <FinancialChoice label="Does not repeat" selected={form.recurrence === 'none'} disabled={saving} onPress={() => update('recurrence', 'none')} />
              <FinancialChoice label="Monthly" selected={form.recurrence === 'monthly'} disabled={saving} onPress={() => update('recurrence', 'monthly')} />
              <FinancialChoice label="Twice a month" selected={form.recurrence === 'twice-monthly'} disabled={saving} onPress={() => update('recurrence', 'twice-monthly')} />
              <FieldError message={errors.recurrence} />
              {form.recurrence !== 'none' ? <>
                <FinancialField label={form.recurrence === 'monthly' ? 'Day of month' : 'First day'} keyboardType="number-pad"
                  hint="Choose a day from 1 to 31." value={form.firstDay} onChangeText={value => update('firstDay', value)} error={errors.firstDay} editable={!saving} />
                {form.recurrence === 'twice-monthly' ? <FinancialField label="Second day" keyboardType="number-pad"
                  hint="Choose a different day from 1 to 31." value={form.secondDay} onChangeText={value => update('secondDay', value)} error={errors.secondDay} editable={!saving} /> : null}
                <LayaText variant="caption" style={styles.warm}>Days 30 and 31 stay as entered. Shorter months are handled when a schedule is calculated.</LayaText>
              </> : null}
            </View> : null}
            {form.status === 'received' ? <LayaText variant="caption" style={styles.warm}>A receipt does not repeat. Selecting Received clears any repeating schedule.</LayaText> : null}
            <Button label={saving ? 'Saving income…' : 'Save income'} disabled={saving} busy={saving} onPress={submit} />
            {saving ? <LayaText accessibilityLiveRegion="polite">Saving on this device…</LayaText> : null}
          </>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  page: { width: '100%', maxWidth: layout.contentWidth, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xl },
  green: { color: colors.surfaceStrong },
  warm: { color: colors.textWarm },
  light: { color: colors.onStrong },
  gold: { color: colors.accent },
  success: { padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.surfaceStrong },
});

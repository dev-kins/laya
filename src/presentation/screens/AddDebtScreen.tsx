import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAddDebtOperation } from '../../application/addDebt';
import { DebtFormError, emptyDebtForm, type DebtForm, type DebtFormErrors } from '../../application/debtForm';
import { DebtChoice, DebtField, FieldError } from '../components/DebtFormControls';
import { Button, LayaText } from '../components/primitives';
import type { AddStackParamList } from '../navigation/routes';
import { colors, layout, spacing } from '../theme/tokens';

export function AddDebtScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'AddDebt'>) {
  const [form, setForm] = useState<DebtForm>({ ...emptyDebtForm });
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const [failure, setFailure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveDebt] = useState(() => createAddDebtOperation());
  const busy = useRef(false);
  const mounted = useRef(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Finish the owned write before letting back/gesture discard this form session.
  usePreventRemove(saving, () => {});

  function update<K extends keyof DebtForm>(key: K, value: DebtForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: undefined,
      ...(key === 'interestChoice' ? { interestRate: undefined, interestPeriod: undefined } : {}),
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
      await saveDebt(form);
      completed = true;
      if (mounted.current) { setSaved(true); scroll.current?.scrollTo({ y: 0, animated: false }); }
    } catch (error) {
      if (mounted.current) {
        if (error instanceof DebtFormError) setErrors(error.fields);
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
              <LayaText variant="display" accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.light}>Utang saved</LayaText>
              <LayaText style={styles.light}>Your debt is recorded on this device. One clear step toward seeing the whole picture.</LayaText>
            </View>
            <Button label="Done" onPress={() => navigation.goBack()} />
          </> : <>
            <Button label="Back to Add" variant="secondary" disabled={saving} onPress={() => navigation.goBack()} />
            <View style={styles.section}>
              <LayaText variant="caption" style={styles.warm}>UTANG · A CLEARER PICTURE</LayaText>
              <LayaText variant="display" accessibilityRole="header">Add a debt</LayaText>
              <LayaText style={styles.warm}>Start with what you know. Payment details can stay blank.</LayaText>
            </View>
            {Object.values(errors).some(Boolean) ? <FieldError message="Please review the fields below." /> : null}
            {failure ? <FieldError message="We couldn’t save this debt on your device. Your entries are still here. Please try again." /> : null}
            <DebtField label="Debt name" placeholder="e.g. Personal loan" value={form.name}
              onChangeText={value => update('name', value)} error={errors.name} editable={!saving} />
            <DebtField label="Provider (optional)" placeholder="e.g. Your lender" value={form.provider}
              onChangeText={value => update('provider', value)} error={errors.provider} editable={!saving} />
            <DebtField label="Current balance (PHP)" suffix="PHP" placeholder="0.00" keyboardType="decimal-pad"
              hint="What remains to pay. Use a decimal point, without commas or a currency symbol."
              value={form.balance} onChangeText={value => update('balance', value)} error={errors.balance} editable={!saving} />
            <View style={styles.section}>
              <LayaText variant="title" accessibilityRole="header">Interest</LayaText>
              <LayaText variant="caption" style={styles.warm}>Not knowing is okay. Zero means you know there is no interest.</LayaText>
              <DebtChoice label="I don’t know the rate" selected={form.interestChoice === 'unknown'} disabled={saving}
                onPress={() => update('interestChoice', 'unknown')} />
              <DebtChoice label="I know the rate" selected={form.interestChoice === 'known'} disabled={saving}
                onPress={() => update('interestChoice', 'known')} />
              <FieldError message={errors.interestChoice} />
              {form.interestChoice === 'known' ? <>
                <DebtField label="Interest rate (%)" suffix="%" keyboardType="decimal-pad" placeholder="e.g. 1.25"
                  value={form.interestRate} onChangeText={value => update('interestRate', value)} error={errors.interestRate} editable={!saving} />
                <LayaText variant="label">Rate period</LayaText>
                <DebtChoice label="Annual" selected={form.interestPeriod === 'annual'} disabled={saving} onPress={() => update('interestPeriod', 'annual')} />
                <DebtChoice label="Monthly" selected={form.interestPeriod === 'monthly'} disabled={saving} onPress={() => update('interestPeriod', 'monthly')} />
                <FieldError message={errors.interestPeriod} />
              </> : null}
            </View>
            <View style={[styles.section, styles.divider]}>
              <LayaText variant="editorial" accessibilityRole="header">Payment details</LayaText>
              <LayaText variant="caption" style={styles.warm}>Each detail is optional. Add only what you know.</LayaText>
              <DebtField label="Regular payment (optional, PHP)" suffix="PHP" keyboardType="decimal-pad" placeholder="Not yet known"
                value={form.scheduledPayment} onChangeText={value => update('scheduledPayment', value)} error={errors.scheduledPayment} editable={!saving} />
              <DebtField label="Next due date (optional)" hint="YYYY-MM-DD · for example, 2026-10-31" placeholder="YYYY-MM-DD"
                autoCapitalize="none" value={form.nextDueDate} onChangeText={value => update('nextDueDate', value)} error={errors.nextDueDate} editable={!saving} />
              <LayaText variant="label">Payment schedule (optional)</LayaText>
              <DebtChoice label="No repeating schedule" selected={form.recurrence === 'none'} disabled={saving} onPress={() => update('recurrence', 'none')} />
              <DebtChoice label="Monthly schedule" selected={form.recurrence === 'monthly'} disabled={saving} onPress={() => update('recurrence', 'monthly')} />
              <DebtChoice label="Twice a month" selected={form.recurrence === 'twice-monthly'} disabled={saving} onPress={() => update('recurrence', 'twice-monthly')} />
              <FieldError message={errors.recurrence} />
              {form.recurrence !== 'none' ? <>
                <DebtField label={form.recurrence === 'monthly' ? 'Day of month' : 'First day'} keyboardType="number-pad"
                  hint="Choose a day from 1 to 31." value={form.firstDay} onChangeText={value => update('firstDay', value)} error={errors.firstDay} editable={!saving} />
                {form.recurrence === 'twice-monthly' ? <DebtField label="Second day" keyboardType="number-pad"
                  hint="Choose a different day from 1 to 31." value={form.secondDay} onChangeText={value => update('secondDay', value)} error={errors.secondDay} editable={!saving} /> : null}
                <LayaText variant="caption" style={styles.warm}>Days 30 and 31 stay as entered. Shorter months are handled when a schedule is calculated.</LayaText>
              </> : null}
            </View>
            <Button label={saving ? 'Saving debt…' : 'Save debt'} disabled={saving} onPress={submit} />
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

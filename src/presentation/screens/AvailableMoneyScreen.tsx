import { usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvailableMoneyFormError, readAvailableMoney, saveAvailableMoney } from '../../application/availableMoney';
import type { AvailableMoney } from '../../domain/AvailableMoney';
import { FieldError, FinancialField } from '../components/FinancialFormControls';
import { Button, LayaText } from '../components/primitives';
import { formatMoneyInput, formatPHP } from '../formatters/financial';
import type { AddStackParamList } from '../navigation/routes';
import { colors, layout, spacing } from '../theme/tokens';

type ReadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; snapshot: AvailableMoney | null };

export function AvailableMoneyScreen({ navigation }: NativeStackScreenProps<AddStackParamList, 'AvailableMoney'>) {
  const [state, setState] = useState<ReadState>({ kind: 'loading' });
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<AvailableMoney | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const load = useCallback(() => {
    const current = ++request.current;
    readAvailableMoney().then(snapshot => {
      if (mounted.current && current === request.current) {
        setAmount(snapshot === null ? '' : formatMoneyInput(snapshot.amount));
        setState({ kind: 'ready', snapshot });
      }
    }, () => {
      if (mounted.current && current === request.current) setState({ kind: 'error' });
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);
  // Read once per editor visit; tab switches must not overwrite unsaved edits.
  usePreventRemove(saving, () => {});

  async function submit() {
    if (busy.current || saved || state.kind !== 'ready') return;
    busy.current = true;
    setSaving(true);
    setError(undefined);
    Keyboard.dismiss();
    let completed = false;
    try {
      const snapshot = await saveAvailableMoney(amount);
      completed = true;
      if (mounted.current) { setSaved(snapshot); scroll.current?.scrollTo({ y: 0, animated: false }); }
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof AvailableMoneyFormError ? failure.message
          : 'We couldn’t save available money on your device. Your entry is still here. Please try again.');
      }
    } finally {
      busy.current = completed;
      if (mounted.current) setSaving(false);
    }
  }
  const displayed = saved ?? (state.kind === 'ready' ? state.snapshot : null);
  const displayAmount = displayed === null ? undefined : formatPHP(displayed.amount);
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          <LayaText variant="editorial" style={styles.green}>Laya</LayaText>
          {saved ? <>
            <View style={styles.success}>
              <LayaText variant="caption" style={styles.gold}>SA ISANG HAKBANG</LayaText>
              <LayaText variant="display" style={styles.light} accessibilityRole="header" accessibilityLiveRegion="polite">Available money updated</LayaText>
              <LayaText style={styles.light}>Laya will use this as a starting point for future planning.</LayaText>
              <LayaText variant="financialBody" style={styles.light}
                accessibilityLabel={`${displayAmount?.replace('₱', '')} Philippine pesos`}>{displayAmount}</LayaText>
            </View>
            <Button label="Done" onPress={() => navigation.goBack()} />
          </> : <>
            <Button label="Back" variant="secondary" disabled={saving} onPress={() => navigation.goBack()} />
            <View style={styles.section}>
              <View style={styles.rule} accessible={false} />
              <LayaText variant="display" style={styles.green} accessibilityRole="header">Available money</LayaText>
              <LayaText>Enter the money you currently have available for your financial plan.</LayaText>
              <LayaText variant="caption" style={styles.warm}>Laya does not connect to your bank or e-wallet in V1.</LayaText>
            </View>
            {state.kind === 'loading' ? <LayaText accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}>Opening available money…</LayaText> : null}
            {state.kind === 'error' ? <>
              <FieldError message="We couldn’t read available money on this device. Please try again." />
              <Button label="Retry" onPress={() => { setState({ kind: 'loading' }); load(); }} />
            </> : null}
            {state.kind === 'ready' ? <>
              {state.snapshot === null ? <LayaText>Not set</LayaText> : <View style={styles.section} accessible
                accessibilityLabel={`Current reported available money: ${displayAmount?.replace('₱', '')} Philippine pesos`}>
                <LayaText variant="caption" style={styles.warm}>Current reported available money</LayaText>
                <LayaText variant="financialBody" style={styles.green}>{displayAmount}</LayaText>
              </View>}
              <FinancialField label="Available money (PHP)" suffix="PHP" placeholder="Enter amount" keyboardType="decimal-pad"
                hint="Use a decimal point, without commas or a currency symbol. Zero is valid."
                value={amount} editable={!saving} error={error} onChangeText={text => { setAmount(text); setError(undefined); }} />
              <LayaText variant="caption" style={styles.warm}>Saving replaces your current reported amount.</LayaText>
              <Button label={saving ? 'Saving available money…' : 'Save available money'} disabled={saving} busy={saving} onPress={submit} />
              {saving ? <LayaText accessibilityLiveRegion="polite">Saving on this device…</LayaText> : null}
            </> : null}
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
  section: { gap: spacing.sm },
  rule: { width: 40, height: 3, backgroundColor: colors.accent },
  green: { color: colors.surfaceStrong },
  warm: { color: colors.textWarm },
  light: { color: colors.onStrong },
  gold: { color: colors.accent },
  success: { padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.surfaceStrong },
});

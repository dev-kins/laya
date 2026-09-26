import { useEffect, useRef, useState } from 'react';

import { onboardingService } from '../application/onboarding';
import { Button, LayaText, Screen } from './components/primitives';
import { RootNavigator } from './navigation/RootNavigator';
import { OnboardingScreen } from './screens/OnboardingScreen';

type StartupState = 'initializing' | 'onboarding' | 'main' | 'failed';

export function StartupGate() {
  const [state, setState] = useState<StartupState>('initializing');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    let current = true;
    mounted.current = true;
    onboardingService.isComplete().then(
      (complete) => { if (current) setState(complete ? 'main' : 'onboarding'); },
      () => { if (current) setState('failed'); },
    );
    return () => { current = false; mounted.current = false; };
  }, [attempt]);

  async function complete() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await onboardingService.complete();
      if (mounted.current) setState('main');
    } catch {
      if (mounted.current) setSaveError(true);
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (state === 'initializing' || state === 'failed') {
    return (
      <Screen>
        <LayaText variant="display" accessibilityRole="header">Laya</LayaText>
        {state === 'initializing' ? <LayaText accessibilityLiveRegion="polite">Opening your local data…</LayaText> : (
          <>
            <LayaText accessibilityRole="alert" accessibilityLiveRegion="assertive">Laya couldn’t open your local data. Please try again.</LayaText>
            <Button label="Try again" onPress={() => { setState('initializing'); setAttempt((value) => value + 1); }} />
          </>
        )}
      </Screen>
    );
  }
  return <RootNavigator onboarding={state === 'onboarding' ? <OnboardingScreen saving={saving} error={saveError} onComplete={complete} /> : null} />;
}

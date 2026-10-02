import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';

import { colors } from '../theme/tokens';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './routes';

const Stack = createNativeStackNavigator<RootStackParamList>();
const theme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.emphasis,
  },
};

function OnboardingReview({ navigation }: NativeStackScreenProps<RootStackParamList, 'OnboardingReview'>) {
  return <OnboardingScreen mode="review" onComplete={() => navigation.goBack()} />;
}

export function RootNavigator({ onboarding }: { onboarding?: ReactNode }) {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {onboarding ? (
          <Stack.Screen name="Onboarding">{() => onboarding}</Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="OnboardingReview" component={OnboardingReview} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddDebtScreen } from '../screens/AddDebtScreen';
import { AddHubScreen } from '../screens/AddHubScreen';
import type { AddStackParamList } from './routes';

const Stack = createNativeStackNavigator<AddStackParamList>();
export function AddNavigator() {
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AddHub" component={AddHubScreen} />
    <Stack.Screen name="AddDebt" component={AddDebtScreen} />
  </Stack.Navigator>;
}

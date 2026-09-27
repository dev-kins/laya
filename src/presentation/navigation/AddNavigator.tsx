import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddDebtScreen } from '../screens/AddDebtScreen';
import { AddHubScreen } from '../screens/AddHubScreen';
import { DebtOverviewScreen } from '../screens/DebtOverviewScreen';
import { AddIncomeScreen } from '../screens/AddIncomeScreen';
import { IncomeOverviewScreen } from '../screens/IncomeOverviewScreen';
import type { AddStackParamList } from './routes';

const Stack = createNativeStackNavigator<AddStackParamList>();
export function AddNavigator() {
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AddHub" component={AddHubScreen} />
    <Stack.Screen name="AddDebt" component={AddDebtScreen} />
    <Stack.Screen name="DebtOverview" component={DebtOverviewScreen} />
    <Stack.Screen name="AddIncome" component={AddIncomeScreen} />
    <Stack.Screen name="IncomeOverview" component={IncomeOverviewScreen} />
  </Stack.Navigator>;
}

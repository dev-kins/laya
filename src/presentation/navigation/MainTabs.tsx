import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeScreen, PlanScreen, ProfileScreen, TimelineScreen } from '../screens/RouteScreens';
import { colors, layout, spacing, typography } from '../theme/tokens';
import type { MainTabParamList } from './routes';
import { AddNavigator } from './AddNavigator';

const Tab = createBottomTabNavigator<MainTabParamList>();
type IconName = ComponentProps<typeof Ionicons>['name'];
const icons: Record<keyof MainTabParamList, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Timeline: { active: 'calendar', inactive: 'calendar-outline' },
  Add: { active: 'add', inactive: 'add' },
  Plan: { active: 'clipboard', inactive: 'clipboard-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return (
    <Tab.Navigator
      initialRouteName="Home"
      backBehavior="initialRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarAccessibilityLabel: route.name,
        tabBarAllowFontScaling: true,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: typography.label,
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.iconSlot,
        // The bar owns the bottom inset; route content owns only top/side insets.
        tabBarStyle: [styles.bar, { height: 52 + typography.label.lineHeight * fontScale + insets.bottom }],
        tabBarIcon: ({ focused, color }) => (
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={route.name === 'Add' ? [styles.add, focused && styles.addSelected] : undefined}>
            <Ionicons name={icons[route.name][focused ? 'active' : 'inactive']}
              size={route.name === 'Add' ? 28 : 23} color={route.name === 'Add' ? colors.onStrong : color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Timeline" component={TimelineScreen} />
      <Tab.Screen name="Add" component={AddNavigator} />
      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background, borderTopColor: colors.border, elevation: 0, shadowOpacity: 0, paddingTop: spacing.xs },
  item: { minHeight: layout.touchTarget },
  iconSlot: { width: 44, height: 44 },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -4 }], borderWidth: 2, borderColor: colors.background },
  addSelected: { borderColor: colors.accent, backgroundColor: colors.primaryPressed },
});

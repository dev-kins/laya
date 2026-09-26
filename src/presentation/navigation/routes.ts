import type { NavigatorScreenParams } from '@react-navigation/native';

export type AddStackParamList = {
  AddHub: undefined;
  AddDebt: undefined;
  DebtOverview: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Timeline: undefined;
  Add: undefined;
  Plan: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
};

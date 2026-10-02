import type { NavigatorScreenParams } from '@react-navigation/native';

export type AddStackParamList = {
  AddHub: undefined;
  AddDebt: undefined;
  DebtOverview: undefined;
  AddIncome: undefined;
  IncomeOverview: undefined;
  AddExpense: undefined;
  ExpenseOverview: undefined;
  AvailableMoney: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Timeline: undefined;
  Add: NavigatorScreenParams<AddStackParamList> | undefined;
  Plan: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
};

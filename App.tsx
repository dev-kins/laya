import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StartupGate } from './src/presentation/StartupGate';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <StartupGate />
    </SafeAreaProvider>
  );
}

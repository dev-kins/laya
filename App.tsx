import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VisualShowcase } from './src/presentation/VisualShowcase';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <VisualShowcase />
    </SafeAreaProvider>
  );
}

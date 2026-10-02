import { LayaText, Screen } from '../components/primitives';
import { VisualShowcase } from '../VisualShowcase';

export function HomeScreen() {
  // Temporary synthetic Home content; retain the approved showcase without duplicating it.
  return <VisualShowcase bottomSafeArea={false} />;
}

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <Screen bottomSafeArea={false}>
      <LayaText variant="display">Laya</LayaText>
      <LayaText variant="heading" accessibilityRole="header">{title}</LayaText>
      <LayaText>{description}</LayaText>
      <LayaText variant="caption">This screen is a preview. No financial data is connected.</LayaText>
    </Screen>
  );
}

export function PlanScreen() {
  return <Placeholder title="Plan" description="Your path forward will take shape here." />;
}

export function ProfileScreen() {
  return <Placeholder title="Profile" description="Your profile and preferences will have a home here." />;
}

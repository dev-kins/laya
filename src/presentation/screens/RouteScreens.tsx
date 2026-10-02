import { LayaText, Screen } from '../components/primitives';

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

export function ProfileScreen() {
  return <Placeholder title="Profile" description="Your profile and preferences will have a home here." />;
}

import { Platform, type TextStyle } from 'react-native';

const palette = {
  harayaDeep: '#173F35', haraya: '#245C4F', araw: '#D8A83E',
  sampaguita: '#FAF7F0', banig: '#EEE5D5', lupa: '#6F5947',
  duyan: '#B8644A', ink: '#1C2623', mutedInk: '#65716C', white: '#FFFFFF',
};

export const colors = {
  background: palette.sampaguita,
  surface: palette.white,
  surfaceSubtle: palette.banig,
  surfaceStrong: palette.harayaDeep,
  text: palette.ink,
  textSecondary: palette.mutedInk,
  textWarm: palette.lupa,
  onStrong: palette.sampaguita,
  primary: palette.haraya,
  primaryPressed: palette.harayaDeep,
  accent: palette.araw,
  emphasis: palette.duyan,
  border: palette.banig,
  disabledBackground: palette.banig,
  disabledText: palette.lupa,
  status: {
    positive: { foreground: palette.harayaDeep, background: '#E4EDE6' },
    warning: { foreground: '#735214', background: '#F6ECD3' },
    danger: { foreground: '#8A3D2C', background: '#F5E4DD' },
    unknown: { foreground: '#49564F', background: '#E8EBE7' },
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { small: 4, medium: 8, surface: 12 } as const;
export const layout = { contentWidth: 520, touchTarget: 48 } as const;

const sans = Platform.select({ android: 'sans-serif', ios: 'System', default: 'sans-serif' });
const serif = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
export const typography = {
  display: { fontFamily: serif, fontSize: 32, lineHeight: 40 },
  // Daily financial utility stays compact; display remains for brand moments.
  editorial: { fontFamily: serif, fontSize: 22, lineHeight: 29 },
  heading: { fontFamily: sans, fontSize: 22, lineHeight: 28, fontWeight: '600' },
  title: { fontFamily: sans, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontFamily: sans, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: sans, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontFamily: sans, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: sans, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  financialHero: { fontFamily: sans, fontSize: 40, lineHeight: 50, fontWeight: '600', fontVariant: ['tabular-nums'] },
  financialBody: { fontFamily: sans, fontSize: 18, lineHeight: 26, fontWeight: '500', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;
export type TypographyRole = keyof typeof typography;

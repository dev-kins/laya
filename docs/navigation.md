# Navigation foundation

`App.tsx` composes the safe-area provider, status bar, and startup gate.
The native root stack conditionally contains `Onboarding` or `MainTabs`, only
after the persisted completion check. Successful completion removes Onboarding
from the available routes, so back cannot return to it. Root and tab route
parameters are defined in `src/presentation/navigation/routes.ts`.

Main tabs are Home (initial), Timeline, Add, Plan, and Profile. Android back
returns from another tab to Home, then follows the platform's normal app-exit
behavior. React Navigation owns transient navigation state; it is not persisted.

Home temporarily reuses `VisualShowcase` with clearly labeled synthetic data.
The other destinations are route shells, including Add, which has no form or
modal workflow. No route imports domain calculations or persistence APIs.

Headers are hidden. Screen content owns top and side safe-area insets; the
non-overlay tab bar owns the bottom inset. Tab screens disable Screen's bottom
safe area to avoid counting it twice. Standalone Screen use retains all edges.

The tab bar uses only Ionicons, loaded through Expo's font/asset support. Laya
typography remains system fonts. Labels and selected semantics are supplied by
React Navigation, with filled/outline icons providing an additional active cue.

Jest uses Expo's Android preset and explicit Expo Babel transformation. App tests
exercise the real navigation tree, including tab selection and return to Home.
Native safe-area measurements use the existing library mock. Android export
checks bundling, not device rendering or hardware-back behavior; those still
require a device review.

See [first-launch behavior](onboarding.md) for persistence and startup semantics.

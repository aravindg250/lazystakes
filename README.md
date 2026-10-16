# LazyStakes

Put money on the things you keep putting off. Pick a task, the days you'll do it, and what a miss costs ($1–$20). Mark it done before 11:59 pm, or your card is charged.

The full product and technical spec lives in [`docs/specsheet.md`](docs/specsheet.md). Read it before changing behaviour — most of the rules that look arbitrary (the stake cap, no streaks, no red on pending money) are deliberate, and the spec says why.

## Status

The front end is built against mock data; there is no backend yet. Version 1 verifies every commitment on the honor system — you hold **Mark done** yourself. Location, photo, and AI-checked proof come in the final phase. See [Build phases](docs/specsheet.md#build-phases).

## Running it

Requires Node 20.19.4+ and the Expo Go app (SDK 57) on your phone.

```bash
npm install
npx expo start
```

Scan the QR code with your iPhone camera (or the Expo Go app on Android).

Expo Go on iOS only supports the latest Expo SDK. If it says the project is incompatible, the project needs an SDK upgrade — see the [upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

### Environment

Copy `.env.example` to `.env` (`copy .env.example .env` on Windows). Every `EXPO_PUBLIC_*` value is bundled into the app and readable by anyone, so only publishable keys belong there — the file explains which are which.

`EXPO_PUBLIC_SHOW_DEV_TOOLS` controls the preview controls. When it's unset they show in development and hide in production builds.

### Dev tools

With dev tools on:

- **Today** has pills to switch between the six day states (pending, kept, charged, free pass, rest day, no commitments).
- Screens that load data have **Simulate data** pills to preview their loading and error states. The same control is in Settings.
- **Settings → Preview screens** opens sign-in and onboarding.

## Project layout

```
app/                   Screens (Expo Router, file-based routes)
src/theme/tokens.ts    Every colour, font, and spacing value — the only file with hex codes
src/components/        Primitives (StakeBlock, Card, Button…) and screen components
src/types/             Types mirroring the database schema, money formatting, stake limits
src/mock/data.ts       Mock commitments and history used until the backend exists
src/dev/               Preview tools and useMockQuery (swapped for real API calls later)
src/lib/haptics.ts     The app's haptic vocabulary
docs/specsheet.md      Product and technical spec
```

## Checks

```bash
npx tsc --noEmit
npx expo lint
```

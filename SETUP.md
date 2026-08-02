# Gymstakes — Part 1 setup

## Create the project

```bash
npx create-expo-app@latest gymstakes --template default
cd gymstakes
```

## Install dependencies

```bash
npx expo install expo-router expo-font expo-splash-screen expo-status-bar \
  react-native-safe-area-context react-native-screens

npx expo install @expo-google-fonts/instrument-sans \
  @expo-google-fonts/jetbrains-mono \
  @expo-google-fonts/fraunces
```

## Drop in the files

```
gymstakes/
├── app/
│   └── _layout.tsx
└── src/
    ├── theme/
    │   ├── tokens.ts
    │   └── index.ts
    ├── components/
    │   └── primitives.tsx
    ├── types/
    │   └── index.ts
    └── mock/
        └── data.ts
```

Delete the starter files `create-expo-app` generated under `app/` — you'll
be replacing them in Part 2.

## Confirm it runs

```bash
npx expo start
```

Scan the QR code with your iPhone camera to open it in Expo Go.

You'll see a blank screen — that's correct. There are no routes yet.
What you're verifying is that the app boots, the splash screen dismisses,
and there are no font-loading errors in the terminal.

## Swapping fonts later

All three faces are referenced only in `src/theme/tokens.ts`. To try a
different pairing, change the `font` object there and update the imports
in `app/_layout.tsx`. Nothing else in the app touches font names.

If you'd rather use Geist Mono than JetBrains Mono, it's a drop-in swap —
JetBrains is the safer package to start with.

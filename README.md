# LazyStakes

Put money on the things you keep putting off. Pick a task, the days you'll do it, and what a miss costs ($1–$20). Mark it done before 11:59 pm, or your card is charged.

The full product and technical spec lives in [`docs/specsheet.md`](docs/specsheet.md). Read it before changing behaviour — most of the rules that look arbitrary (the stake cap, no streaks, no red on pending money) are deliberate, and the spec says why.

## Status

The app signs in with an emailed one-time code and runs on real data from the server in [`server/`](server/README.md) (Railway + Supabase + Stripe test mode). Card entry arrives with the first development build. Version 1 verifies every commitment on the honor system — you hold **Mark done** yourself. Location, photo, and AI-checked proof come in the final phase. See [Build phases](docs/specsheet.md#build-phases).

## Running it

Requires Node 20.19.4+ and the Expo Go app (SDK 57) on your phone.

```bash
npm install
npx expo start
```

Scan the QR code with your iPhone camera (or the Expo Go app on Android).

Expo Go on iOS only supports the latest Expo SDK. If it says the project is incompatible, the project needs an SDK upgrade — see the [upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

### Environment

Copy `.env.example` to `.env` (`copy .env.example .env` on Windows) and fill in the API URL, the Supabase URL, and the Supabase publishable key. Every `EXPO_PUBLIC_*` value is bundled into the app and readable by anyone, so only publishable keys belong there — the file explains which are which. Restart `npx expo start` after changing it.

### Sign-in

Email one-time codes through Supabase Auth. Two dashboard settings matter:

- **Authentication → Email Templates**: both **Confirm signup** (first sign-in) and **Magic Link** (every one after) must include `{{ .Token }}` so the email contains the code. The default templates only have a link, which doesn't open the app.
- Supabase's built-in email sender is rate-limited to a few emails an hour. Fine for testing; set up custom SMTP before launch.

To give your own account Stripe's test Visa (so misses actually charge in test mode): sign in once on the phone, then `cd server` and `npm run test-card -- you@example.com`.

`EXPO_PUBLIC_SHOW_DEV_TOOLS` controls the preview controls. When it's unset they show in development and hide in production builds.

### Dev tools

With dev tools on:

- Screens that load data have **Simulate data** pills to preview their loading and error states. The same control is in Settings.

## Project layout

```
app/                   Screens (Expo Router, file-based routes)
src/theme/tokens.ts    Every colour, font, and spacing value — the only file with hex codes
src/components/        Primitives (StakeBlock, Card, Button…) and screen components
src/types/             Types mirroring the database schema, money formatting, stake limits
src/lib/api.ts         Every call to the server, and the response types
src/lib/auth.tsx       Session, email-code sign-in, onboarding flag
src/lib/query.ts       useQuery: screen data with loading/error states, reloads on focus
src/lib/supabase.ts    Supabase client (sign-in only; the app never touches tables)
src/dev/               Preview tools (simulated loading/error)
src/lib/haptics.ts     The app's haptic vocabulary
server/                API, scheduler, schema — see server/README.md
docs/specsheet.md      Product and technical spec
```

## Checks

```bash
npx tsc --noEmit
npx expo lint
```

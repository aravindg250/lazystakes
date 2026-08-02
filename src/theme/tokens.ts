/**
 * tokens.ts — Block theme.
 *
 * The signature of this system is the stake block: a saturated filled
 * rectangle holding the money, which changes colour with state. Everything
 * else stays quiet so that block is the loudest thing on screen.
 *
 * Rule unchanged: this is the only file in the app containing a hex value
 * or a font name. If a component needs a colour that isn't here, add it
 * here first.
 */

import { StyleSheet } from "react-native";

// ---------------------------------------------------------------
// Colour
// ---------------------------------------------------------------
// Cool-biased neutrals so the violet reads as a deliberate accent rather
// than as a tint of the background.

const light = {
  bg: "#F2F0F5",
  surface: "#FFFFFF",
  surfaceSunken: "#F2F0F5",

  textPrimary: "#16151A",
  textSecondary: "#6E6B78",
  textMuted: "#9B97A3",

  hairline: "#EFEDF2",
  hairlineStrong: "#DEDBE4",

  accent: "#5B3DF5",
  accentSoft: "#EEEAFE",
  accentText: "#4227C4",
  onAccent: "#FFFFFF",

  // Stake block fills. Each state is a background + foreground + label
  // triple, because text on a saturated fill needs its own tone — never
  // plain white or plain grey.
  blockPendingBg: "#5B3DF5",
  blockPendingFg: "#FFFFFF",
  blockPendingLabel: "#D6CCFF",

  blockKeptBg: "#E4F6EF",
  blockKeptFg: "#0B7A50",
  blockKeptLabel: "#3D9B77",

  blockChargedBg: "#FCEAE9",
  blockChargedFg: "#A32D2D",
  blockChargedLabel: "#C46560",

  blockExcusedBg: "#EEEAFE",
  blockExcusedFg: "#4227C4",
  blockExcusedLabel: "#8B78E0",

  blockIdleBg: "#F2F0F5",
  blockIdleFg: "#6E6B78",
  blockIdleLabel: "#9B97A3",

  dotKept: "#0FA36B",
  dotPending: "#5B3DF5",
  dotCharged: "#D64545",
  dotExcused: "#8B78E0",
  dotIdle: "#DEDBE4",
};

const dark = {
  bg: "#111014",
  surface: "#1B1A20",
  surfaceSunken: "#24232B",

  textPrimary: "#F4F3F7",
  textSecondary: "#A29EAD",
  textMuted: "#736F7D",

  hairline: "#2A2932",
  hairlineStrong: "#3A3844",

  accent: "#7C5CFF",
  accentSoft: "#241C4A",
  accentText: "#A992FF",
  onAccent: "#FFFFFF",

  blockPendingBg: "#6B4AFF",
  blockPendingFg: "#FFFFFF",
  blockPendingLabel: "#D6CCFF",

  blockKeptBg: "#14312A",
  blockKeptFg: "#4FCB99",
  blockKeptLabel: "#2F8A67",

  blockChargedBg: "#331C1C",
  blockChargedFg: "#E88B84",
  blockChargedLabel: "#9E5A55",

  blockExcusedBg: "#241C4A",
  blockExcusedFg: "#A992FF",
  blockExcusedLabel: "#6E5CB8",

  blockIdleBg: "#24232B",
  blockIdleFg: "#A29EAD",
  blockIdleLabel: "#736F7D",

  dotKept: "#4FCB99",
  dotPending: "#7C5CFF",
  dotCharged: "#E88B84",
  dotExcused: "#A992FF",
  dotIdle: "#3A3844",
};

export const palettes = { light, dark };
export type Palette = typeof light;

// ---------------------------------------------------------------
// Spacing — 8px base
// ---------------------------------------------------------------

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 44,
} as const;

// Block wants generous radius — it's the main shape signal separating this
// direction from the ledger one.
export const radius = {
  block: 12,
  control: 12,
  card: 16,
  pill: 999,
} as const;

export const hairline = StyleSheet.hairlineWidth;

// ---------------------------------------------------------------
// Typography — one family, three weights
// ---------------------------------------------------------------
// Space Grotesk at 700 does the work the monospace was doing in the ledger
// theme, so the mono and serif faces are both gone. One family also means
// two fewer font packages loading at startup.

export const font = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  bold: "SpaceGrotesk_700Bold",
} as const;

export const type = {
  title:      { fontFamily: font.bold,    fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  heading:    { fontFamily: font.medium,  fontSize: 17, lineHeight: 23 },
  body:       { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: font.medium,  fontSize: 15, lineHeight: 22 },
  label:      { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  caption:    { fontFamily: font.regular, fontSize: 11, lineHeight: 15 },

  moneyHero: { fontFamily: font.bold,   fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  moneyLg:   { fontFamily: font.bold,   fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },
  moneySm:   { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
} as const;

export const tabularNums = { fontVariant: ["tabular-nums" as const] };

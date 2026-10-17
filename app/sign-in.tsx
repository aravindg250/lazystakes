/**
 * app/sign-in.tsx
 *
 * The premise gets stated on the first screen someone sees. An app that
 * charges people money should say so before they sign in, not three screens
 * later — anyone who bounces here was never going to keep a commitment
 * anyway, and burying it just produces refund requests.
 *
 * v1 signs in with a one-time code sent by email: no password to forget,
 * and it works in Expo Go. Sign in with Apple joins it once there's a paid
 * Apple Developer account (expo-apple-authentication's button, which Apple
 * requires to be used unmodified).
 *
 * There's no "account created" step: signing in navigates on its own (see
 * app/_layout.tsx), to onboarding the first time and Today after that.
 */

import React, { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Screen, Title, Body, Caption, Button, Gap, StakeBlock } from "../src/components/primitives";
import { FieldGroup, TextField } from "../src/components/form";
import { useAuth } from "../src/lib/auth";
import { SUPABASE_CONFIGURED } from "../src/lib/supabase";
import { haptics } from "../src/lib/haptics";
import { useTheme, space } from "../src/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase's messages, in the app's voice. */
function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/expired|invalid/i.test(msg)) return "That code didn't work. Check it, or send a new one.";
  if (/rate limit|only request this after|too many/i.test(msg)) return "Too many codes requested. Wait a minute and try again.";
  if (/network|fetch/i.test(msg)) return "Couldn't reach the sign-in service. Check your connection.";
  return msg;
}

export default function SignInScreen() {
  const { c } = useTheme();
  const { sendCode, verifyCode } = useAuth();

  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL.test(email.trim());
  const codeValid = /^\d{6,10}$/.test(code.trim());

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      haptics.warning();
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const onSend = () => run(async () => {
    const to = email.trim().toLowerCase();
    await sendCode(to);
    setSentTo(to);
    setCode("");
  });

  const onVerify = () => run(async () => {
    await verifyCode(sentTo!, code.trim());
    haptics.success();
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: space.xl }}
          >
            <Title>Put money on it.</Title>
            <Gap size={space.md} />
            <Body tone="secondary">
              {"Pick what you keep putting off and the days you'll do it. Miss one, " +
                "and you pay what you said you'd pay."}
            </Body>

            <Gap size={space.xxl} />
            <StakeBlock state="pending" amountCents={500} labelOverride="Per missed day" />
            <Gap size={space.xxl} />

            {!SUPABASE_CONFIGURED ? (
              <Body tone="charged">
                Sign-in isn&apos;t configured. Set EXPO_PUBLIC_SUPABASE_URL and
                EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env, then restart Expo.
              </Body>
            ) : sentTo === null ? (
              <>
                <FieldGroup label="Email">
                  <TextField
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    onSubmitEditing={() => { if (emailValid && !busy) onSend(); }}
                  />
                </FieldGroup>
                <Gap size={space.lg} />
                <Button
                  label={busy ? "Sending…" : "Email me a code"}
                  variant="primary"
                  disabled={!emailValid || busy}
                  onPress={onSend}
                />
              </>
            ) : (
              <>
                <FieldGroup label={`Code sent to ${sentTo}`} hint="It can take a minute. Check spam if it doesn't show up.">
                  <TextField
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
                    placeholder="123456"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={10}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => { if (codeValid && !busy) onVerify(); }}
                  />
                </FieldGroup>
                <Gap size={space.lg} />
                <Button
                  label={busy ? "Checking…" : "Sign in"}
                  variant="primary"
                  disabled={!codeValid || busy}
                  onPress={onVerify}
                />
                <Gap size={space.sm} />
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Button
                    label="Use a different email"
                    variant="ghost"
                    disabled={busy}
                    onPress={() => { setSentTo(null); setError(null); }}
                    style={{ flex: 1 }}
                  />
                  <Button label="Resend" variant="ghost" disabled={busy} onPress={onSend} style={{ flex: 1 }} />
                </View>
              </>
            )}

            {error && (
              <>
                <Gap size={space.md} />
                <Body tone="charged">{error}</Body>
              </>
            )}

            <Gap size={space.lg} />
            <Caption style={{ textAlign: "center" }}>
              By continuing you agree to the Terms and Privacy Policy.
            </Caption>
          </ScrollView>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Вход" };

export default function SignInPage() {
  return (
    <AuthScreen>
      {/* withSignUp: an email without an account goes straight to registration instead of «account not found». */}
      <SignIn withSignUp fallbackRedirectUrl="/profile" signUpFallbackRedirectUrl="/profile" />
    </AuthScreen>
  );
}

import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Вход" };

export default function SignInPage() {
  return (
    <AuthScreen>
      <SignIn fallbackRedirectUrl="/profile" />
    </AuthScreen>
  );
}

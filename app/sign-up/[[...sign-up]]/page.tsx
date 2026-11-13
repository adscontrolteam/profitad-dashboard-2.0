import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = { title: "Регистрация" };

export default function SignUpPage() {
  return (
    <AuthScreen>
      <SignUp fallbackRedirectUrl="/profile" />
    </AuthScreen>
  );
}

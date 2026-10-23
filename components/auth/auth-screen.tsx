import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";

export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background p-6">
      <Logo className="w-[200px]" />
      <Suspense fallback={<div className="h-[420px] w-full max-w-[400px] animate-pulse rounded-[26px] bg-muted" />}>
        {children}
      </Suspense>
    </main>
  );
}

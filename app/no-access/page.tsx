import type { Metadata } from "next";
import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthScreen } from "@/components/auth/auth-screen";
import { getViewerState } from "@/lib/access/viewer";

export const metadata: Metadata = { title: "Нет доступа" };

export default function NoAccessPage() {
  return (
    <AuthScreen>
      <section className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-[var(--shadow)] lg:p-8">
        <h1 className="section-title">Нет доступа</h1>
        <Suspense fallback={<p className="mt-3 h-12 text-sm text-muted-foreground">…</p>}>
          <NoAccessDetails />
        </Suspense>
      </section>
    </AuthScreen>
  );
}

async function NoAccessDetails() {
  const state = await getViewerState();
  if (state.status === "signed-out") redirect("/sign-in");
  if (state.status === "ok") redirect("/profile");

  return (
    <>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {state.email ? (
          <>
            Для <span className="font-semibold text-foreground">{state.email}</span> доступ ещё не выдан.
          </>
        ) : (
          "Подтвердите почту аккаунта, чтобы получить доступ."
        )}{" "}
        Попросите администратора или Project Manager открыть доступ.
      </p>
      <SignOutButton redirectUrl="/sign-in">
        <button type="button" className="btn-primary mt-6">
          Войти под другой почтой
        </button>
      </SignOutButton>
    </>
  );
}

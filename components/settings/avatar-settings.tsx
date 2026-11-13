"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const MAX_BYTES = 10 * 1024 * 1024;

/** Profile photo, stored in Clerk: upload, take it from the Google account, or remove. */
export function AvatarSettings() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const google = user?.externalAccounts.find((a) => a.provider === "google" && a.imageUrl);

  const run = (task: () => Promise<unknown>, done: string) =>
    startTransition(async () => {
      setMessage(null);
      try {
        await task();
        await user?.reload();
        setMessage({ ok: true, text: done });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Не получилось обновить фото. Попробуйте ещё раз или другой файл." });
      }
    });

  const upload = (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) return setMessage({ ok: false, text: "Нужна картинка: JPG, PNG или WEBP." });
    if (file.size > MAX_BYTES) return setMessage({ ok: false, text: "Файл больше 10 МБ." });
    run(() => user.setProfileImage({ file }), "Фото обновлено.");
  };

  const fromGoogle = () => {
    if (!user || !google) return;
    run(async () => {
      const res = await fetch(google.imageUrl);
      if (!res.ok) throw new Error("google image");
      await user.setProfileImage({ file: await res.blob() });
    }, "Взяли фото из Google.");
  };

  const remove = () => {
    if (!user) return;
    run(() => user.setProfileImage({ file: null }), "Фото удалено.");
  };

  return (
    <Card className="min-w-0">
      <h2 className="section-title">Фото профиля</h2>
      <p className="mt-1 text-sm text-muted-foreground">Видно в «Профиле» и в задачах. При входе через Google фото подтягивается само.</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {isLoaded && user ? (
          // eslint-disable-next-line @next/next/no-img-element -- Clerk avatar
          <img
            src={user.imageUrl}
            alt=""
            className={cn("size-20 shrink-0 rounded-full object-cover transition-opacity", pending && "opacity-50")}
          />
        ) : (
          <span className="size-20 shrink-0 animate-pulse rounded-full bg-muted" />
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={!user || pending} onClick={() => fileRef.current?.click()}>
            {pending ? "Сохраняю…" : "Загрузить фото"}
          </button>
          {google && (
            <button type="button" className="btn-ghost border border-border" disabled={pending} onClick={fromGoogle}>
              Взять из Google
            </button>
          )}
          {user?.hasImage && (
            <button type="button" className="btn-ghost text-negative hover:text-negative" disabled={pending} onClick={remove}>
              Удалить
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {message && (
        <p role="status" className={cn("mt-3 text-sm font-medium", message.ok ? "text-positive" : "text-negative")}>
          {message.text}
        </p>
      )}
    </Card>
  );
}

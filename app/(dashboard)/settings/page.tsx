import type { Metadata } from "next";
import { InfoHint } from "@/components/ui/info-hint";
import Link from "next/link";
import { AvatarSettings } from "@/components/settings/avatar-settings";
import { ThemePicker } from "@/components/settings/theme-picker";
import { TotemPicker } from "@/components/settings/totem-picker";
import { currentUser } from "@clerk/nextjs/server";
import { Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/access/viewer";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const { permissions, email } = await requireViewer();
  const user = await currentUser();
  const totem = (user?.publicMetadata as { totem?: { kind?: string; color?: string; name?: string } } | undefined)?.totem ?? null;

  return (
    <div className="flex flex-col gap-5">
      <AvatarSettings />

      <TotemPicker seed={email} initial={totem} />

      <Card className="min-w-0">
        <h2 className="section-title">Оформление <InfoHint className="ml-1">Выбор сохраняется на этом устройстве.</InfoHint></h2>
        <div className="mt-5">
          <ThemePicker />
        </div>
      </Card>

      {permissions.canManageAccess && (
        <Card className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Доступы</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Кто видит дашборд, какие вкладки и проекты им доступны.
            </p>
          </div>
          <Link href="/settings/access" className="btn-primary">
            Управлять доступами
          </Link>
        </Card>
      )}

      {permissions.canManageAccess && (
        <Card className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="section-title">Подключения</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Google Ads, Таблицы, Drive и CRM: статус ключей, синхронизация и журнал действий.
            </p>
          </div>
          <Link href="/settings/integrations" className="btn-primary">
            Открыть
          </Link>
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AvatarSettings } from "@/components/settings/avatar-settings";
import { ThemePicker } from "@/components/settings/theme-picker";
import { Card } from "@/components/ui/card";
import { requireViewer } from "@/lib/access/viewer";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const { permissions } = await requireViewer();

  return (
    <div className="flex flex-col gap-5">
      <AvatarSettings />

      <Card className="min-w-0">
        <h2 className="section-title">Оформление</h2>
        <p className="mt-1 text-sm text-muted-foreground">Выбор сохраняется на этом устройстве.</p>
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

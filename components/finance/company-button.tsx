"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { saveCompanyAction, type FinState } from "@/app/(dashboard)/finance/actions";
import { Drawer, Field, FormError } from "./drawer";

const IDLE: FinState = { ok: false, message: null };

/** The client's company details (name, address, tax ids) — printed in «BILL TO» of English invoices. */
export function CompanyButton({ projectId, projectName, company }: { projectId: string; projectName: string; company: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, saving] = useActionState(async (prev: FinState, f: FormData) => {
    const res = await saveCompanyAction(prev, f);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    return res;
  }, IDLE);

  return (
    <>
      <button type="button" className={company ? "btn-ghost px-3 py-1.5" : "btn-primary px-3 py-1.5"} onClick={() => setOpen(true)}>
        {company ? "Изменить" : "Заполнить"}
      </button>
      {open && (
        <Drawer title={`Данные компании · ${projectName}`} onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-1 flex-col gap-4">
            <input type="hidden" name="projectId" value={projectId} />
            <Field
              label="Как в инвойсе, блок BILL TO"
              hint="Каждая строка — с новой строки: название, адрес, налоговые номера, почта, телефон. Пишите так, как должно быть в документе"
            >
              <textarea
                name="company"
                rows={10}
                defaultValue={company}
                autoFocus
                className="field resize-y"
                placeholder={"COMPANY SP. Z O. O.\nul. Street 1, lok. 2\nCity, 00-000, POLSKA\nNIP: 0000000000\nREGON: 000000000\nEmail: name@company.com\nPhone: 000000000"}
              />
            </Field>
            <FormError message={state.message && !state.ok ? state.message : null} />
            <div className="mt-auto pt-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}

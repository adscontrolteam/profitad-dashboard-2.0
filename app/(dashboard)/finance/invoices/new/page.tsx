import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceBuilder, type ProjectOption } from "@/components/finance/invoice-builder";
import { requireSection } from "@/lib/access/viewer";
import { buildFinanceReport } from "@/lib/finance/report";
import { getInvoice, listMethods } from "@/lib/finance/store";

export const metadata: Metadata = { title: "Financial · Инвойс" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/finance/invoices/new">) {
  await requireSection("finance");
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : null;
  const [report, methods, initial] = await Promise.all([buildFinanceReport(), listMethods(), id ? getInvoice(id) : null]);
  if (id && !initial) notFound();

  const projects: ProjectOption[] = report.projects
    .filter((p) => p.status !== "archived")
    .map((p) => ({
      id: p.id,
      name: p.name,
      currency: p.terms?.currency ?? null,
      due: Object.fromEntries(p.months.filter((m) => m.accrual).map((m) => [m.month, { amount: Math.round(m.accrual!.total * 100) / 100, currency: m.accrual!.currency }])),
    }));
  const today = new Date().toISOString().slice(0, 10);
  const projectId = typeof sp.project === "string" ? sp.project : null;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);

  return <InvoiceBuilder projects={projects} methods={methods} rates={report.rates} initial={initial} defaults={{ projectId, month, issueDate: today }} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InvoiceDocument } from "@/components/finance/invoice-document";
import { PrintBar } from "@/components/finance/print-bar";
import { requireSection } from "@/lib/access/viewer";
import { getInvoice } from "@/lib/finance/store";

export const metadata: Metadata = { title: "Рахунок-фактура" };

/** Bare A4 page of an invoice for «Save as PDF» (outside the dashboard shell). */
export default function InvoicePrintPage({ params }: PageProps<"/invoice/[id]">) {
  return (
    <Suspense>
      <InvoicePrint params={params} />
    </Suspense>
  );
}

async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("finance");
  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  const slug = (invoice.recipient?.details.recipient ?? invoice.recipient?.label ?? "")
    .replace(/^ФОП\s+/i, "")
    .split(/\s+/)[0]
    ?.toLowerCase();
  const fileName = ["rahunok_faktura", slug, Math.round(invoice.total), invoice.currency.toLowerCase(), invoice.issueDate].filter(Boolean).join("_");

  return (
    <main className="invoice-print min-h-dvh bg-muted/60 py-6 print:bg-white print:py-0">
      <PrintBar fileName={fileName} />
      <InvoiceDocument
        doc={{
          issueDate: invoice.issueDate,
          recipient: invoice.recipient,
          currency: invoice.currency,
          items: invoice.items,
          purpose: invoice.purpose,
          payLink: invoice.payLink,
          payer: invoice.recipient?.payer ?? null,
        }}
      />
    </main>
  );
}

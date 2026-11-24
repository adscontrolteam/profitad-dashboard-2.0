import { redirect } from "next/navigation";

/** Invoices and payments live on «Клиенты и оплаты» now; the old address keeps working. */
export default function FinanceInvoicesPage() {
  redirect("/finance/clients#payments");
}

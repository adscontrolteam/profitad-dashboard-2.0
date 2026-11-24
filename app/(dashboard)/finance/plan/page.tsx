import { redirect } from "next/navigation";

/** Plan / fact lives on «Расходы и план» now; the old address keeps working. */
export default function FinancePlanPage() {
  redirect("/finance/expenses#plan");
}

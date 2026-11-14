import type { InvoiceItem } from "@/db/schema";
import { CURRENCY_WORD, formatInvoiceAmount, recipientRows } from "@/lib/finance/methods";

export interface InvoiceDocData {
  issueDate: string;
  recipient: { kind: string; label: string; details: Record<string, string>; payer?: string } | null;
  currency: string;
  items: InvoiceItem[];
  purpose: string;
  payLink: string;
  payer?: string | null;
}

/** «Рахунок-фактура» — A4 page that matches the agency's invoice template. Always light, for print. */
export function InvoiceDocument({ doc }: { doc: InvoiceDocData }) {
  const word = CURRENCY_WORD[doc.currency] ?? doc.currency;
  const total = doc.items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const rows = doc.recipient ? recipientRows(doc.recipient.kind, doc.recipient.details, doc.payLink, doc.currency) : [];
  const cell = "border border-[#bdbdbd] px-[11px] py-[10px] align-middle";

  return (
    <div className="invoice-doc mx-auto w-full max-w-[794px]" style={{ containerType: "inline-size" }}>
      <div
        className="invoice-page box-border aspect-[210/297] w-full overflow-hidden bg-white px-[9%] pt-[9%] text-[#111] shadow-[var(--shadow)]"
        style={{ fontFamily: "'DejaVu Sans', Verdana, Arial, sans-serif", fontSize: "1.85cqw" }}
      >
        <h1 className="text-center font-bold" style={{ fontSize: "2em", margin: "0 0 1.1em" }}>
          РАХУНОК-ФАКТУРА
        </h1>
        <p className="text-right" style={{ margin: "0 0 1.1em" }}>
          Дата: {doc.issueDate.split("-").reverse().join(".")}
        </p>
        {doc.payer ? <p style={{ margin: "-0.6em 0 1.1em" }}>Платник: {doc.payer}</p> : null}

        <p className="font-bold" style={{ margin: "0 0 0.3em" }}>
          Отримувач платежу
        </p>
        <table className="w-[98%] border-collapse" style={{ marginLeft: "1.5%", fontSize: "0.95em" }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={`${cell} w-[29%] bg-[#f2f2f2] font-bold`}>{r.label}</td>
                <td className={`${cell} break-all`}>
                  {r.href ? (
                    <a href={r.href} className="text-[#1a56db] underline">
                      {r.value}
                    </a>
                  ) : (
                    r.value
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="font-bold" style={{ margin: "1.6em 0 0.3em" }}>
          Послуга
        </p>
        <table className="w-[98%] border-collapse" style={{ marginLeft: "1.5%", fontSize: "0.95em" }}>
          <thead>
            <tr className="bg-[#e8e8e8] font-bold">
              <td className={`${cell} w-[7%] text-center`}>№</td>
              <td className={cell}>Найменування</td>
              <td className={`${cell} w-[14%]`}>Кількість</td>
              <td className={`${cell} w-[19%] whitespace-nowrap`}>Сума, {word}</td>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={i}>
                <td className={`${cell} text-center`}>{i + 1}</td>
                <td className={cell}>{item.name}</td>
                <td className={`${cell} text-right`}>{item.qty}</td>
                <td className={`${cell} whitespace-nowrap text-right`}>{formatInvoiceAmount(Number(item.amount) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-right" style={{ margin: "1em 0 2.2em" }}>
          Всього до сплати: {formatInvoiceAmount(total)} {word}
        </p>
        {doc.purpose ? <p>Призначення платежу: {doc.purpose}</p> : null}
      </div>
    </div>
  );
}

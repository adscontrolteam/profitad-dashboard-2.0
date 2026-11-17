import type { InvoiceItem, InvoiceRecipient } from "@/db/schema";
import { amountInWords, dateEn, formatAmountEn } from "@/lib/finance/methods";

export interface InvoiceIntlData {
  issueDate: string;
  currency: string;
  items: InvoiceItem[];
  paid: boolean;
  intl: NonNullable<InvoiceRecipient["intl"]>;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** English «INVOICE» for foreign clients (paid by a payment link, issued after the payment). A4, always light. */
export function InvoiceIntlDocument({ doc }: { doc: InvoiceIntlData }) {
  const f = doc.intl.from;
  const total = doc.items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const service = doc.items.map((i) => i.name).filter(Boolean).join(", ");
  const accountCurrency = f.ibanCurrency || "";
  const box = "border border-[#9a9a9a] bg-[#f4f4f4]";
  const cell = "border border-[#9a9a9a] px-[0.7em] py-[0.45em] align-top";

  const from = [
    f.nameEn || f.recipient,
    f.taxId && `Tax ID / EDRPOU: ${f.taxId}`,
    f.addressEn && `Address: ${f.addressEn}`,
    f.iban && `IBAN${accountCurrency ? ` (${accountCurrency})` : ""}: ${f.iban}`,
  ].filter(Boolean) as string[];

  const bank = [
    (f.nameEn || f.recipient) && `Beneficiary: ${(f.nameEn || f.recipient).replace(/^(FOP|ФОП)\s+/i, "")}`,
    f.iban && `IBAN: ${f.iban}`,
    accountCurrency && `Currency: ${accountCurrency}`,
    f.bankEn && `Beneficiary Bank: ${f.bankEn}`,
    f.swift && `SWIFT/BIC: ${f.swift}`,
    f.bankAddressEn && `Bank address: ${f.bankAddressEn}`,
    ...(f.correspondents ? ["Correspondent Banks:", ...lines(f.correspondents)] : []),
  ].filter(Boolean) as string[];

  return (
    <div className="invoice-doc mx-auto w-full max-w-[794px]" style={{ containerType: "inline-size" }}>
      <div
        className="invoice-page box-border aspect-[210/297] w-full overflow-hidden bg-white px-[5%] pt-[4%] text-[#111] shadow-[var(--shadow)]"
        style={{ fontFamily: "'DejaVu Sans', Verdana, Arial, sans-serif", fontSize: "1.6cqw", lineHeight: 1.3 }}
      >
        <div className="flex items-start justify-between">
          <h1 className="font-bold" style={{ fontSize: "2.9em", lineHeight: 1.1, margin: "0.25em 0 0" }}>
            INVOICE
          </h1>
          <div className="text-right font-bold" style={{ lineHeight: 1.25 }}>
            <div>{dateEn(doc.issueDate)}</div>
            <div>{doc.currency}</div>
            <div>{doc.paid ? "PAID" : "UNPAID"}</div>
          </div>
        </div>

        <table className="w-full border-collapse" style={{ marginTop: "3em" }}>
          <tbody>
            <tr>
              <td className={`${cell} ${box} w-1/2`}>
                <div style={{ marginBottom: "1.2em" }}>FROM</div>
                {from.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </td>
              <td className={`${cell} ${box} w-1/2`}>
                <div style={{ marginBottom: "1.2em" }}>BILL TO</div>
                {lines(doc.intl.billTo).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="w-[105%] border-collapse" style={{ margin: "2.2em 0 0 -2.5%" }}>
          <thead>
            <tr className="bg-[#f4f4f4]">
              <td className={cell}>Description</td>
              <td className={`${cell} w-[10%]`}>Qty</td>
              <td className={`${cell} w-[18%]`}>Unit price</td>
              <td className={`${cell} w-[18%]`}>Amount</td>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, i) => (
              <tr key={i}>
                <td className={cell}>{item.name}</td>
                <td className={cell}>{item.qty}</td>
                <td className={`${cell} text-right font-bold`}>{formatAmountEn((Number(item.amount) || 0) / (Number(item.qty) || 1))}</td>
                <td className={`${cell} text-right font-bold`}>{formatAmountEn(Number(item.amount) || 0)}</td>
              </tr>
            ))}
            <tr>
              <td className={cell} colSpan={2}></td>
              <td className={cell}>Total</td>
              <td className={`${cell} whitespace-nowrap text-right font-bold`}>
                {formatAmountEn(total)} {doc.currency}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ margin: "1.8em 0 0 2.4em" }}>
          <div>Service: {service}</div>
          <div>Amount in words: {amountInWords(total, doc.currency)}</div>
          <div className="font-bold" style={{ fontSize: "1.6em", margin: "0.7em 0 0.3em" }}>
            Payment / Bank Details
          </div>
        </div>
        <div className={`${box} px-[0.7em] py-[0.45em]`}>
          {bank.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div style={{ margin: "1.8em 0 0 2.4em" }}>Payment status: {doc.paid ? "PAID" : "UNPAID"}</div>
      </div>
    </div>
  );
}

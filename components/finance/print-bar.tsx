"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Sets the PDF file name (the document title) and opens the print dialog when asked to. */
export function PrintBar({ fileName }: { fileName: string }) {
  const search = useSearchParams();
  useEffect(() => {
    document.title = fileName;
    if (search.get("print") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [fileName, search]);

  return (
    <div className="mx-auto mb-4 flex w-full max-w-[794px] items-center gap-2 px-3 print:hidden">
      <Link href="/finance/invoices" className="btn-ghost">
        ← К инвойсам
      </Link>
      <span className="ml-auto text-xs text-muted-foreground">В окне печати выберите «Сохранить как PDF»</span>
      <button type="button" className="btn-primary" onClick={() => window.print()}>
        Скачать PDF
      </button>
    </div>
  );
}

"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

export function BarcodeDisplay({ value, className }: { value: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      height: 48,
      margin: 0,
      fontSize: 14,
      background: "transparent",
      lineColor: "var(--color-text)",
    });
  }, [value]);

  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}

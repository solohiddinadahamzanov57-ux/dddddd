"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export function BarcodeScanner({ onResult }: { onResult: (text: string) => void }) {
  const t = useTranslations("fleet");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const genericErrorRef = useRef(t("cameraGenericError"));
  const [error, setError] = useState<string | null>(null);

  // Keep the refs current without writing to them during render (React 19
  // forbids that) -- this runs after every render instead.
  useEffect(() => {
    onResultRef.current = onResult;
    genericErrorRef.current = t("cameraGenericError");
  });

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: IScannerControls | undefined;
    let foundAlready = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current ?? undefined,
        (result) => {
          if (result && !foundAlready) {
            foundAlready = true;
            controls?.stop();
            onResultRef.current(result.getText());
          }
        },
      )
      .then((c) => {
        controls = c;
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : genericErrorRef.current);
      });

    return () => controls?.stop();
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--color-status-service)]">
        {t("cameraUnavailable", { message: error })}
      </p>
    );
  }

  return <video ref={videoRef} className="w-full rounded-md bg-black" muted playsInline />;
}

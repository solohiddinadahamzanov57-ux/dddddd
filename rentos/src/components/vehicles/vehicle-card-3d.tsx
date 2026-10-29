"use client";

import "@google/model-viewer";
import { useEffect, useRef } from "react";

import { colorToHex, hexToRgbaFactor } from "@/lib/vehicles/color";

interface ModelViewerElement extends HTMLElement {
  model?: {
    materials: Array<{
      name: string;
      pbrMetallicRoughness: {
        setBaseColorFactor: (rgba: [number, number, number, number]) => void;
      };
    }>;
  };
}

export function VehicleCard3D({
  modelGlbKey,
  color,
  className,
}: {
  modelGlbKey: string;
  color: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current as ModelViewerElement | null;
    if (!el) return;

    const applyColor = () => {
      const material = el.model?.materials.find((m) => m.name === "body");
      material?.pbrMetallicRoughness.setBaseColorFactor(hexToRgbaFactor(colorToHex(color)));
    };

    el.addEventListener("load", applyColor);
    applyColor();
    return () => el.removeEventListener("load", applyColor);
  }, [color, modelGlbKey]);

  return (
    <model-viewer
      ref={ref}
      src={`/models/${modelGlbKey}`}
      alt={`3D preview, ${color} ${modelGlbKey.replace(".glb", "")}`}
      camera-orbit="-35deg 78deg 105%"
      exposure="1"
      shadow-intensity="0.8"
      disable-zoom
      className={className}
      style={{ width: "100%", height: "100%", backgroundColor: "transparent", display: "block" }}
    />
  );
}

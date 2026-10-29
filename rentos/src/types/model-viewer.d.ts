import type { DetailedHTMLProps, HTMLAttributes } from "react";

// React 19 resolves JSX.IntrinsicElements from the "react" module's own JSX
// namespace (via react/jsx-runtime), not an ambient global one -- so the
// augmentation has to target "react" directly.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean;
        "camera-orbit"?: string;
        "shadow-intensity"?: string | number;
        "auto-rotate"?: boolean;
        exposure?: string | number;
        "disable-zoom"?: boolean;
        loading?: "auto" | "lazy" | "eager";
        reveal?: "auto" | "interaction" | "manual";
      };
    }
  }
}

export {};

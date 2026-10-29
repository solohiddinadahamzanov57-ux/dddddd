// Vehicles store color as free text ("Silver", "Blue", ...), not a hex code
// -- this maps the common ones to something recolorable on the 3D card.
// Anything unrecognized falls back to a neutral gray rather than guessing.
const NAMED_COLORS: Record<string, string> = {
  white: "#f2f2f2",
  black: "#1a1a1a",
  silver: "#c7c9cc",
  gray: "#8a8d93",
  grey: "#8a8d93",
  red: "#b3261e",
  blue: "#1d4ed8",
  green: "#2f7d4f",
  yellow: "#e7b815",
  orange: "#d96b1f",
  brown: "#6b4a34",
  gold: "#b8963f",
  beige: "#cbbfa3",
  purple: "#6b3fa0",
};

const FALLBACK_HEX = "#9aa0a8";

export function colorToHex(name: string): string {
  return NAMED_COLORS[name.trim().toLowerCase()] ?? FALLBACK_HEX;
}

export function hexToRgbaFactor(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

// Deliberately excludes visually ambiguous characters (0/O, 1/I/L) since
// these get printed and scanned by hand in a parking lot.
const BARCODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomBarcode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += BARCODE_CHARS[Math.floor(Math.random() * BARCODE_CHARS.length)];
  }
  return `V-${code}`;
}

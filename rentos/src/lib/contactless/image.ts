/** Scales (width, height) down to fit inside a max side length, keeping the aspect ratio. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Re-encodes a phone photo as a JPEG no larger than `maxSide` px, which keeps
 * uploads small enough for mobile data and well under the bucket's 5 MB cap.
 * Browser only.
 */
export async function downscaleToJpeg(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo"))),
      "image/jpeg",
      quality,
    );
  });
}

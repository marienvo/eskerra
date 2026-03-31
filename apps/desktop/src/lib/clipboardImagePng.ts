import type {Image} from '@tauri-apps/api/image';

/**
 * Clipboard images are exposed as RGBA. Re-encode as PNG bytes for vault storage.
 */

export async function rgbaImageToPngBytes(image: Image): Promise<Uint8Array> {
  const rgba = await image.rgba();
  const {width, height} = await image.size();
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid clipboard image dimensions');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }
  const clamped = new Uint8ClampedArray(rgba.length);
  clamped.set(rgba);
  const imageData = new ImageData(clamped, width, height);
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('canvas.toBlob failed'));
      }
    }, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

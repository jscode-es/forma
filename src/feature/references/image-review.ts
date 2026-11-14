import type { ReferenceImage } from "@/lib/forma";
import { activeImage } from "@/stores/project-store";
import { heightTransform, silhouetteBounds, type Bounds } from "./review";

export type Review = { bounds: Bounds | null; opaque: boolean; width: number; height: number };

async function decode(reference: ReferenceImage, projectId: string | null) {
  const bytes = await window.forma!.references.read(activeImage(reference), projectId);
  return createImageBitmap(new Blob([new Uint8Array(bytes)]));
}

export async function reviewImage(reference: ReferenceImage, projectId: string | null): Promise<Review> {
  const bitmap = await decode(reference, projectId);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 16) { opaque = false; break; }
    return { bounds: silhouetteBounds(pixels, canvas.width, canvas.height), opaque, width: canvas.width, height: canvas.height };
  } finally { bitmap.close(); }
}

export async function matchReferenceHeight(reference: ReferenceImage, projectId: string | null, bounds: Bounds, heightFraction: number) {
  const bitmap = await decode(reference, projectId);
  try {
    const size = 1024;
    const transform = heightTransform(bounds, size, heightFraction);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height,
      transform.x + bounds.x * transform.scale, transform.y + bounds.y * transform.scale,
      bounds.width * transform.scale, bounds.height * transform.scale);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("image-unsupported")), "image/png"));
    return window.forma!.references.stageBytes(new Uint8Array(await blob.arrayBuffer()));
  } finally { bitmap.close(); }
}

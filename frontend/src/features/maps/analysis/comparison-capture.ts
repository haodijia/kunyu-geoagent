import type { Map } from "maplibre-gl";
import type { ComparisonCapture } from "@/features/maps/analysis/MapComparison";
import {
  captureMapCanvas,
  MapCaptureError,
} from "@/features/maps/runtime/map-capture";
import { zhCN } from "@/locales/zh-CN";

export async function captureComparedMap(
  map: Map,
  comparison: ComparisonCapture | null,
): Promise<Blob> {
  if (comparison === null) return captureMapCanvas(map);
  if (!comparison.ready)
    throw new MapCaptureError("MAP_NOT_READY", zhCN.map.captureNotReady);
  const blobs = await Promise.all([
    captureMapCanvas(map),
    captureMapCanvas(comparison.map),
  ]);
  const images = await Promise.all(
    blobs.map((blob) => createImageBitmap(blob)),
  );
  try {
    const left = images[0]!,
      right = images[1]!;
    const canvas = document.createElement("canvas");
    canvas.width = left.width;
    canvas.height = left.height;
    const context = canvas.getContext("2d");
    if (context === null)
      throw new MapCaptureError("MAP_NOT_READY", zhCN.map.captureNotReady);
    context.drawImage(left, 0, 0);
    const edge = Math.round(left.width * comparison.ratio);
    context.save();
    context.beginPath();
    context.rect(edge, 0, left.width - edge, left.height);
    context.clip();
    context.drawImage(right, 0, 0, left.width, left.height);
    context.restore();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob === null
            ? reject(
                new MapCaptureError("MAP_NOT_READY", zhCN.map.captureNotReady),
              )
            : resolve(blob),
        "image/png",
      ),
    );
  } finally {
    images.forEach((value) => value.close());
  }
}

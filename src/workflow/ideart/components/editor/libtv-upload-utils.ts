"use client";

import { uploadPlatformAssetFile } from "../../lib/platform-assets";

export const LIBTV_DEFAULT_ORDINARY_IMAGE_URL =
  "/images/libtv/style-gallery-card.png";
export const LIBTV_MP3_UPLOAD_ACCEPT = ".mp3,audio/mpeg,audio/mp3";

export function isLibTvMp3File(file: File | null | undefined) {
  if (!file) return false;
  const mimeType = String(file.type || "").toLowerCase();
  const fileName = String(file.name || "").toLowerCase();
  return (
    fileName.endsWith(".mp3") ||
    mimeType === "audio/mpeg" ||
    mimeType === "audio/mp3"
  );
}

export async function uploadCanvasNodeFile(
  file: File,
  options?: { onProgress?: (progress: number) => void },
) {
  const platformFile = await uploadPlatformAssetFile(file, options);
  const publicUrl = String(platformFile.url || "").trim();
  if (!publicUrl) throw new Error("资源上传结果为空");
  options?.onProgress?.(1);

  return {
    publicUrl,
    libtvUrl: publicUrl,
    fileId: platformFile.id,
    platformFile,
  };
}

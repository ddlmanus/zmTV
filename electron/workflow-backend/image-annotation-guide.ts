import sharp from "sharp";
import type { AnnotationEditTask } from "./prompts/image-tools";

const REGION_COLORS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#30D5C8",
  "#007AFF",
  "#5856D6",
  "#FF2D95",
];

function dataUriBuffer(value: string) {
  const match = String(value || "").match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

async function fetchImageBuffer(value: string) {
  const embedded = dataUriBuffer(value);
  if (embedded) return embedded;
  const response = await fetch(value);
  if (!response.ok)
    throw new Error(`Failed to fetch image: ${response.status}`);
  const mime = response.headers.get("content-type") || "";
  if (mime && !mime.toLowerCase().startsWith("image/")) {
    throw new Error(`Fetched resource is not image: ${mime}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function getMaskMarkStrength(
  data: Buffer,
  offset: number,
  channels: number,
  options: { useBrightnessMask: boolean; allowAlphaOnlyMask: boolean },
) {
  const alpha = channels >= 4 ? Number(data[offset + 3] || 0) : 255;
  if (alpha <= 10) return 0;
  const red = Number(data[offset] || 0);
  const green = Number(data[offset + 1] || 0);
  const blue = Number(data[offset + 2] || 0);
  const brightness = Math.max(red, green, blue);
  if (options.useBrightnessMask) {
    if (brightness <= 10) return 0;
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    return Math.max(brightness, luminance);
  }
  return options.allowAlphaOnlyMask ? alpha : 0;
}

export async function createAnnotationGuideImage(
  imageUrl: string,
  tasks: AnnotationEditTask[],
) {
  const sourceBuffer = await fetchImageBuffer(imageUrl);
  const normalizedSource = await sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .png()
    .toBuffer();
  const metadata = await sharp(normalizedSource, { failOn: "none" }).metadata();
  const width = Math.max(1, Math.round(Number(metadata.width || 1)));
  const height = Math.max(1, Math.round(Number(metadata.height || 1)));
  type Overlay = Parameters<ReturnType<typeof sharp>["composite"]>[0][number];
  const overlays: Overlay[] = [
    {
      input: Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgba(12,15,24,0.08)"/></svg>`,
      ),
      top: 0,
      left: 0,
    },
  ];

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const color = REGION_COLORS[index % REGION_COLORS.length];
    const maskData = String(task.maskData || "").trim();
    let maskOriginalWidth = 0;
    let maskOriginalHeight = 0;
    const explicitMaskWidth = Math.max(
      0,
      Math.round(Number(task.maskWidth || 0)),
    );
    const explicitMaskHeight = Math.max(
      0,
      Math.round(Number(task.maskHeight || 0)),
    );

    if (maskData) {
      try {
        const maskBuffer = await fetchImageBuffer(maskData);
        const maskMetadata = await sharp(maskBuffer, {
          failOn: "none",
        }).metadata();
        maskOriginalWidth = Math.max(
          0,
          Math.round(Number(maskMetadata.width || 0)),
        );
        maskOriginalHeight = Math.max(
          0,
          Math.round(Number(maskMetadata.height || 0)),
        );
        const hex = color.replace("#", "");
        const red = Number.parseInt(hex.slice(0, 2), 16) || 0;
        const green = Number.parseInt(hex.slice(2, 4), 16) || 0;
        const blue = Number.parseInt(hex.slice(4, 6), 16) || 0;
        const { data: maskPixels, info } = await sharp(maskBuffer, {
          failOn: "none",
        })
          .resize(width, height, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const channels = Math.max(1, Number(info.channels || 4));
        const totalPixels = width * height;
        let brightPixels = 0;
        let alphaPixels = 0;
        for (let pixel = 0; pixel < totalPixels; pixel += 1) {
          const offset = pixel * channels;
          const alpha =
            channels >= 4 ? Number(maskPixels[offset + 3] || 0) : 255;
          const brightness = Math.max(
            maskPixels[offset] || 0,
            maskPixels[offset + 1] || 0,
            maskPixels[offset + 2] || 0,
          );
          if (alpha > 10) alphaPixels += 1;
          if (alpha > 10 && brightness > 10) brightPixels += 1;
        }
        const useBrightnessMask = brightPixels > 0;
        const allowAlphaOnlyMask =
          !useBrightnessMask && alphaPixels > 0 && alphaPixels < totalPixels;
        const tintPixels = Buffer.alloc(totalPixels * 4);
        for (let pixel = 0; pixel < totalPixels; pixel += 1) {
          const source = pixel * channels;
          const target = pixel * 4;
          const strength = getMaskMarkStrength(maskPixels, source, channels, {
            useBrightnessMask,
            allowAlphaOnlyMask,
          });
          tintPixels[target] = red;
          tintPixels[target + 1] = green;
          tintPixels[target + 2] = blue;
          tintPixels[target + 3] = Math.max(
            0,
            Math.min(0x88, Math.round(strength * (0x88 / 255))),
          );
        }
        if (brightPixels > 0 || allowAlphaOnlyMask) {
          overlays.push({
            input: await sharp(tintPixels, {
              raw: { width, height, channels: 4 },
            })
              .png()
              .toBuffer(),
            top: 0,
            left: 0,
          });
        }
      } catch (error) {
        console.warn("[workflow annotation] failed to paint task mask", error);
      }
    }

    if (!task.bounds) continue;
    const boundsSpaceWidth = explicitMaskWidth || maskOriginalWidth;
    const boundsSpaceHeight = explicitMaskHeight || maskOriginalHeight;
    const scaleX = boundsSpaceWidth > 0 ? width / boundsSpaceWidth : 1;
    const scaleY = boundsSpaceHeight > 0 ? height / boundsSpaceHeight : 1;
    const x = Math.max(0, Number(task.bounds.x || 0) * scaleX);
    const y = Math.max(0, Number(task.bounds.y || 0) * scaleY);
    const boxWidth = Math.max(1, Number(task.bounds.width || 1) * scaleX);
    const boxHeight = Math.max(1, Number(task.bounds.height || 1) * scaleY);
    const regionIndex =
      Number.isFinite(Number(task.regionIndex)) && Number(task.regionIndex) > 0
        ? Number(task.regionIndex)
        : index + 1;
    const badgeRadius = Math.max(
      14,
      Math.round(Math.min(width, height) * 0.018),
    );
    const badgeX = Math.min(
      width - badgeRadius - 4,
      Math.max(badgeRadius + 4, x + badgeRadius),
    );
    const badgeY = Math.max(badgeRadius + 4, y + badgeRadius);
    const strokeWidth = Math.max(
      2,
      Math.round(Math.min(width, height) * 0.003),
    );
    overlays.push({
      input: Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="10 8"/>
          <circle cx="${badgeX}" cy="${badgeY}" r="${badgeRadius}" fill="${color}"/>
          <text x="${badgeX}" y="${badgeY + Math.round(badgeRadius * 0.36)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(badgeRadius * 1.05)}" font-weight="700" fill="#FFFFFF">${regionIndex}</text>
        </svg>
      `),
      top: 0,
      left: 0,
    });
  }

  const output = await sharp(normalizedSource, { failOn: "none" })
    .composite(overlays)
    .png()
    .toBuffer();
  return `data:image/png;base64,${output.toString("base64")}`;
}

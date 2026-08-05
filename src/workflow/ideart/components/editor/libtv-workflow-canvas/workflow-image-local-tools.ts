import { getWorkflowImageRenderUrl } from "../libtv-workflow-surface/workflow-media-utils";

export type WorkflowImageGridPiece = {
  dataUrl: string;
  row: number;
  column: number;
  width: number;
  height: number;
};

function loadWorkflowImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败，无法执行本地处理"));
    image.src = getWorkflowImageRenderUrl(sourceUrl);
  });
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建图片处理画布");
  return { canvas, context };
}

export async function splitWorkflowImageIntoGrid(
  sourceUrl: string,
  rows: number,
  columns: number,
) {
  const safeRows = Math.max(1, Math.min(5, Math.round(rows)));
  const safeColumns = Math.max(1, Math.min(5, Math.round(columns)));
  const image = await loadWorkflowImage(sourceUrl);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const pieces: WorkflowImageGridPiece[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    const sourceTop = Math.round((row * sourceHeight) / safeRows);
    const sourceBottom = Math.round(((row + 1) * sourceHeight) / safeRows);
    for (let column = 0; column < safeColumns; column += 1) {
      const sourceLeft = Math.round((column * sourceWidth) / safeColumns);
      const sourceRight = Math.round(
        ((column + 1) * sourceWidth) / safeColumns,
      );
      const width = Math.max(1, sourceRight - sourceLeft);
      const height = Math.max(1, sourceBottom - sourceTop);
      const { canvas, context } = createCanvas(width, height);
      context.drawImage(
        image,
        sourceLeft,
        sourceTop,
        width,
        height,
        0,
        0,
        width,
        height,
      );
      pieces.push({
        dataUrl: canvas.toDataURL("image/png"),
        row,
        column,
        width,
        height,
      });
    }
  }
  return pieces;
}

export async function rotateWorkflowImageClockwise(sourceUrl: string) {
  const image = await loadWorkflowImage(sourceUrl);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const { canvas, context } = createCanvas(sourceHeight, sourceWidth);
  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

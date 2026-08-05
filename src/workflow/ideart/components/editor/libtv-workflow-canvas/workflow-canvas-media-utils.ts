export async function dataUrlToWorkflowFile(dataUrl: string, filename: string) {
    const response = await fetch(dataUrl)
    if (!response.ok) {
        throw new Error(`读取标注图失败: HTTP ${response.status}`)
    }
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type || "image/png" })
}

export async function cropWorkflowImageDataUrl(dataUrl: string, aspectRatio: number) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error("截图读取失败"))
        element.src = dataUrl
    })
    const width = Math.max(1, image.naturalWidth || image.width)
    const height = Math.max(1, image.naturalHeight || image.height)
    const sourceAspect = width / height
    const cropWidth = sourceAspect > aspectRatio ? Math.round(height * aspectRatio) : width
    const cropHeight = sourceAspect > aspectRatio ? height : Math.round(width / aspectRatio)
    const sx = Math.max(0, Math.round((width - cropWidth) / 2))
    const sy = Math.max(0, Math.round((height - cropHeight) / 2))
    const canvas = document.createElement("canvas")
    canvas.width = cropWidth
    canvas.height = cropHeight
    const context = canvas.getContext("2d")
    if (!context) throw new Error("截图裁剪失败")
    context.drawImage(image, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
    return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
        width: cropWidth,
        height: cropHeight,
    }
}

export async function cropWorkflowImageDataUrlByRect(
    dataUrl: string,
    rect: { x: number; y: number; width: number; height: number },
    viewport: { width: number; height: number },
) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error("框选截图读取失败"))
        element.src = dataUrl
    })
    const imageWidth = Math.max(1, image.naturalWidth || image.width)
    const imageHeight = Math.max(1, image.naturalHeight || image.height)
    const viewportWidth = Math.max(1, viewport.width)
    const viewportHeight = Math.max(1, viewport.height)
    const scaleX = imageWidth / viewportWidth
    const scaleY = imageHeight / viewportHeight
    const sx = Math.max(0, Math.min(imageWidth - 1, Math.round(rect.x * scaleX)))
    const sy = Math.max(0, Math.min(imageHeight - 1, Math.round(rect.y * scaleY)))
    const sw = Math.max(1, Math.min(imageWidth - sx, Math.round(rect.width * scaleX)))
    const sh = Math.max(1, Math.min(imageHeight - sy, Math.round(rect.height * scaleY)))
    const canvas = document.createElement("canvas")
    canvas.width = sw
    canvas.height = sh
    const context = canvas.getContext("2d")
    if (!context) throw new Error("框选截图裁剪失败")
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
    return canvas.toDataURL("image/jpeg", 0.92)
}

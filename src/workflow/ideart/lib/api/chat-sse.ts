import { runWorkflowPrediction } from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import { resolveApiServiceIdForBaseUrl } from "@/api/client";

export async function fetchSSE(
  url: string,
  body: any,
  onMessage: (data: any) => void,
  onErrorOrInit?: ((err: any) => void) | RequestInit,
  init?: RequestInit,
) {
  const onError =
    typeof onErrorOrInit === "function" ? onErrorOrInit : undefined;
  const requestInit =
    typeof onErrorOrInit === "function" ? init : onErrorOrInit;
  if (url === "/api/chat/generate-video") {
    onMessage({ type: "step", status: "running", content: "视频生成中" });
    const prediction = await runWorkflowPrediction({
      modelId: String(body?.modelId || body?.model || "").trim(),
      mode:
        String(
          body?.workflowEndpointMethod || body?.method || body?.mode || "",
        ).trim() || undefined,
      prompt: String(body?.message || body?.prompt || "").trim(),
      aspectRatio:
        String(body?.aspectRatio || body?.aspect_ratio || "").trim() ||
        undefined,
      resolution: String(body?.resolution || "").trim() || undefined,
      duration: body?.duration,
      count: body?.count || 1,
      generateAudio:
        typeof body?.generateAudio === "boolean"
          ? body.generateAudio
          : typeof body?.audioEnabled === "boolean"
            ? body.audioEnabled
            : undefined,
      enableWebSearch:
        body?.enableWebSearch === true ||
        body?.enable_web_search === true ||
        Array.isArray(body?.tools),
      referenceImages: Array.isArray(body?.images) ? body.images : [],
      referenceVideo:
        typeof body?.referenceVideo === "string"
          ? body.referenceVideo
          : undefined,
      referenceVideos: Array.isArray(body?.referenceVideos)
        ? body.referenceVideos
        : [],
      audioReferences: Array.isArray(body?.audioReferences)
        ? body.audioReferences
        : [],
      extra: body,
    });
    prediction.urls.forEach((url) =>
      onMessage({
        type: "complete",
        status: "completed",
        videoUrl: url,
        videos: [url],
        taskId: prediction.id,
        baseUrl: prediction.baseUrl,
        statusUrl:
          "/api/chat/task-status?taskId=" +
          encodeURIComponent(prediction.id) +
          "&type=video&modelId=" +
          encodeURIComponent(prediction.endpointId) +
          "&baseUrl=" +
          encodeURIComponent(prediction.baseUrl),
        endpointId: prediction.endpointId,
        providerKey:
          resolveApiServiceIdForBaseUrl(prediction.baseUrl) ||
          "current-provider",
        taskType: "video",
      }),
    );
    return;
  }
  const response = await fetch(url, {
    ...requestInit,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(requestInit?.headers || {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || error.error || `Request failed: ${response.status}`,
    );
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  if (!reader) throw new Error("No reader available");

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || ""; // Keep the last partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") continue;
          let data: any;
          try {
            data = JSON.parse(dataStr);
          } catch (e) {
            console.warn("Failed to parse SSE data", e);
            continue;
          }
          // Let handler errors bubble up so callers can show the real reason.
          onMessage(data);
        }
      }
    }
  } catch (e) {
    if (onError) onError(e);
    else throw e;
  }
}

import type { Context, Hono } from "hono";
import type { WorkflowPlatformMediaBody } from "../../../src/types/workflowBackend";
import { generateCodexPlatformMedia } from "../agent/platform-media";
import type { WorkflowBackendContext } from "../context";
import { createAnnotationGuideImage } from "../image-annotation-guide";
import {
  DEFAULT_WAVESPEED_ERASE_PROMPT,
  buildAnnotationEditPrompt,
  buildServerRelightPrompt,
  normalizeRelightControls,
  normalizeWorkflowRedrawPayload,
  type AnnotationEditTask,
} from "../prompts/image-tools";
import { persistGeneratedFile } from "./assets";
import { newId, now, record, text } from "./shared";

type CanvasJob = {
  id: string;
  projectId: string;
  kind: string;
  status: "queued" | "running" | "success" | "failed";
  payload: { projectId: string; request: Record<string, unknown> };
  resultData?: Record<string, unknown>;
  resultUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};
type CanvasJobStore = { items: CanvasJob[] };

function jobs(context: WorkflowBackendContext) {
  return context.store.read<CanvasJobStore>("canvas-jobs", { items: [] });
}

function writeJob(context: WorkflowBackendContext, job: CanvasJob) {
  const store = jobs(context);
  job.updatedAt = now();
  store.items = [job, ...store.items.filter((item) => item.id !== job.id)];
  context.store.write("canvas-jobs", store);
  return job;
}

function mediaRequestForJob(job: CanvasJob): WorkflowPlatformMediaBody {
  const request = job.payload.request;
  const imageUrl = text(
    request.imageUrl || request.image || request.src || request.url,
    20_000,
  );
  const videoUrl = text(request.videoUrl || request.video, 20_000);
  const kind = job.kind.toLowerCase();
  const outputType = kind.includes("video")
    ? "video"
    : kind.includes("world") || kind.includes("3d")
      ? "3d"
      : "image";
  const operationPrompt: Record<string, string> = {
    remove_bg:
      "Remove the background precisely. Preserve the complete subject and return a transparent PNG.",
    erase:
      "Remove the masked object and reconstruct the background naturally. Keep every pixel outside the mask unchanged.",
    outpaint:
      "Extend the image naturally while preserving the original subject, style, lighting and perspective.",
    upscale:
      "Upscale and restore fine detail without changing composition or identity.",
    video_upscale:
      "Upscale the video and restore detail while preserving timing, motion and audio.",
    vectorize:
      "Convert the reference into a clean, faithful vector-style image.",
  };
  const prompt =
    text(request.prompt || request.message, 20_000) ||
    operationPrompt[kind] ||
    "Generate the requested media from the supplied references.";
  const requestedModel = text(request.modelId || request.model, 300);
  const specializedModel =
    kind === "remove_bg"
      ? "wavespeed-ai/image-background-remover"
      : requestedModel;
  return {
    ...request,
    output_type: outputType,
    prompt,
    model: specializedModel,
    operation: kind,
    mode: text(
      request.workflowEndpointMethod || request.method || request.mode,
      300,
    ),
    reference_images: imageUrl ? [imageUrl] : request.reference_images,
    reference_videos: videoUrl ? [videoUrl] : request.reference_videos,
  };
}

export async function runWorkflowPlatformMedia(
  context: WorkflowBackendContext,
  body: WorkflowPlatformMediaBody,
  projectId = "zaomeng-desktop-workflow",
) {
  projectId = text(projectId, 191) || "zaomeng-desktop-workflow";
  const result = await generateCodexPlatformMedia({
    userId: "desktop-user",
    project: {
      id: projectId,
      userId: "desktop-user",
      path: context.runtimeRoot,
    },
    body,
  });
  const urls = result.outputs
    .map((item) => text(item.url, 20_000))
    .filter(Boolean);
  if (!urls.length) throw new Error("模型任务完成但没有返回媒体文件");
  for (const url of urls) {
    persistGeneratedFile(context, {
      fileType: result.type,
      fileUrl: url,
      model: result.model,
      metadata: {
        mode: result.mode,
        parameters: result.parameters,
        provider: "desktop-current-provider",
        providerBaseUrl: result.baseUrl,
        providerTaskId: result.taskId,
      },
      projectId,
    });
  }
  return { result, urls };
}

async function runCanvasJob(context: WorkflowBackendContext, jobId: string) {
  const job = jobs(context).items.find((item) => item.id === jobId);
  if (!job || job.status !== "queued") return;
  job.status = "running";
  job.resultData = { message: "正在调用当前供应商模型" };
  writeJob(context, job);
  try {
    const generated = await runWorkflowPlatformMedia(
      context,
      mediaRequestForJob(job),
      job.projectId,
    );
    job.status = "success";
    job.resultUrl = generated.urls[0];
    job.resultData = {
      message: "生成完成",
      url: generated.urls[0],
      urls: generated.urls,
      model: generated.result.model,
      mode: generated.result.mode,
      taskId: generated.result.taskId,
      baseUrl: generated.result.baseUrl,
    };
    job.errorMessage = null;
  } catch (error) {
    job.status = "failed";
    job.errorMessage = error instanceof Error ? error.message : String(error);
    job.resultData = { message: job.errorMessage };
  }
  writeJob(context, job);
}

function directImageBody(
  body: Record<string, unknown>,
  operation: string,
): WorkflowPlatformMediaBody {
  const images = [
    ...(Array.isArray(body.imageUrls) ? body.imageUrls : []),
    ...(Array.isArray(body.referenceImages) ? body.referenceImages : []),
    ...(Array.isArray(body.reference_images) ? body.reference_images : []),
    ...(Array.isArray(body.images) ? body.images : []),
    body.imageUrl,
  ]
    .map((item) => text(item, 20_000))
    .filter(Boolean);
  return {
    ...body,
    output_type: "image",
    operation,
    model: text(body.modelId || body.model, 300),
    mode: text(body.workflowEndpointMethod || body.method || body.mode, 300),
    prompt: text(body.prompt || body.message, 20_000),
    reference_images: images,
    mask_image: text(body.maskData || body.maskImage || body.mask, 20_000),
  };
}

function sse(value: Record<string, unknown>) {
  return new Response("data: " + JSON.stringify(value) + "\n\n", {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export function registerGenerationRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.post("/api/canvas/jobs", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const projectId = text(body.projectId, 191);
    const kind = text(body.kind, 64).toLowerCase();
    if (!projectId) return c.json({ error: "projectId is required" }, 400);
    if (!kind) return c.json({ error: "Invalid job kind" }, 400);
    const timestamp = now();
    const job: CanvasJob = {
      id: newId("canvas_job"),
      projectId,
      kind,
      status: "queued",
      payload: { projectId, request: record(body.request) },
      resultUrl: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    writeJob(context, job);
    setTimeout(() => void runCanvasJob(context, job.id), 0);
    return c.json(job, 201);
  });
  app.get("/api/canvas/jobs", (c) => {
    const projectId = text(c.req.query("projectId"), 191);
    const limit = Math.max(1, Math.min(80, Number(c.req.query("limit") || 20)));
    return c.json({
      items: jobs(context)
        .items.filter((job) => !projectId || job.projectId === projectId)
        .slice(0, limit),
    });
  });
  app.get("/api/canvas/jobs/:id", (c) => {
    const job = jobs(context).items.find(
      (item) => item.id === c.req.param("id"),
    );
    return job ? c.json(job) : c.json({ error: "任务不存在" }, 404);
  });
  app.get("/api/chat/jobs/:id", (c) => {
    const job = jobs(context).items.find(
      (item) => item.id === c.req.param("id"),
    );
    return job ? c.json(job) : c.json({ error: "任务不存在" }, 404);
  });

  app.post("/api/remove-bg", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const generated = await runWorkflowPlatformMedia(
        context,
        {
          ...directImageBody(body, "remove-background"),
          model: "wavespeed-ai/image-background-remover",
          prompt:
            "Remove the background precisely and preserve the complete subject as a transparent PNG.",
        },
        text(body.projectId, 191),
      );
      return c.json({ success: true, url: generated.urls[0] });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  const imageEdit = async (c: Context, operation: string) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const generated = await runWorkflowPlatformMedia(
        context,
        directImageBody(body, operation),
        text(body.projectId, 191),
      );
      return c.json({
        success: true,
        url: generated.urls[0],
        imageUrl: generated.urls[0],
        modelId: generated.result.model,
        providerKey: "desktop-current-provider",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  };

  app.post("/api/edit-image", (c) => imageEdit(c, "edit"));
  app.post("/api/erase", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const imageUrl = text(body.imageUrl || body.image, 20_000);
      const maskData = text(
        body.maskData || body.maskImage || body.mask,
        20_000,
      );
      if (!imageUrl) return c.json({ error: "imageUrl is required" }, 400);
      if (!maskData) return c.json({ error: "maskData is required" }, 400);
      const prompt = text(body.prompt, 20_000);
      const generated = await runWorkflowPlatformMedia(
        context,
        {
          ...directImageBody(body, "erase"),
          prompt: prompt
            ? `${prompt}\n\n${DEFAULT_WAVESPEED_ERASE_PROMPT}`
            : DEFAULT_WAVESPEED_ERASE_PROMPT,
          reference_images: [imageUrl, maskData],
          mask_image: maskData,
        },
        text(body.projectId, 191),
      );
      return c.json({
        success: true,
        url: generated.urls[0],
        urls: generated.urls,
        prompt: prompt
          ? `${prompt}\n\n${DEFAULT_WAVESPEED_ERASE_PROMPT}`
          : DEFAULT_WAVESPEED_ERASE_PROMPT,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/api/annotation-edit", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const imageUrl = text(body.imageUrl || body.image, 20_000);
      if (!imageUrl) return c.json({ error: "imageUrl is required" }, 400);
      const tasks = (Array.isArray(body.tasks) ? body.tasks : []).map((item) =>
        record(item),
      ) as AnnotationEditTask[];
      if (!tasks.length) return c.json({ error: "tasks are required" }, 400);
      const referenceImages = [
        ...(Array.isArray(body.referenceImages) ? body.referenceImages : []),
        ...(Array.isArray(body.reference_images) ? body.reference_images : []),
      ]
        .map((item) => text(item, 20_000))
        .filter(Boolean);
      const workflowRedraw = normalizeWorkflowRedrawPayload(
        body.workflowRedraw,
      );
      const prompt = buildAnnotationEditPrompt(
        tasks,
        text(body.prompt, 20_000),
        referenceImages.length,
        workflowRedraw,
      );
      const guideImage = await createAnnotationGuideImage(imageUrl, tasks);
      const generated = await runWorkflowPlatformMedia(
        context,
        {
          ...directImageBody(body, "annotation-edit"),
          prompt,
          reference_images: [imageUrl, guideImage, ...referenceImages],
          aspect_ratio: text(
            body.aspectRatio || workflowRedraw?.aspectRatio,
            64,
          ),
          image_size: text(body.size || workflowRedraw?.size, 64),
          count: Number(body.count || workflowRedraw?.count || 1),
        },
        text(body.projectId, 191),
      );
      return c.json({
        success: true,
        url: generated.urls[0],
        urls: generated.urls,
        prompt,
        modelId: generated.result.model,
        providerKey: "desktop-current-provider",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/api/workflow/relight-image", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const controls = normalizeRelightControls(body.controls);
      const prompt = buildServerRelightPrompt(
        controls,
        text(body.prompt, 20_000),
      );
      const generated = await runWorkflowPlatformMedia(
        context,
        { ...directImageBody(body, "relight"), prompt, controls },
        text(body.projectId, 191),
      );
      return c.json({
        success: true,
        url: generated.urls[0],
        urls: generated.urls,
        prompt,
        controls,
        modelId: generated.result.model,
        providerKey: "desktop-current-provider",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/api/chat/edit-image", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const generated = await runWorkflowPlatformMedia(
        context,
        directImageBody(body, "edit"),
        text(body.projectId, 191),
      );
      return sse({
        type: "done",
        success: true,
        imageUrl: generated.urls[0],
        modelId: generated.result.model,
        providerKey: "desktop-current-provider",
      });
    } catch (error) {
      return sse({
        type: "error",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

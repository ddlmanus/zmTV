import type { Hono } from "hono";
import { generateCodexPlatformMedia } from "../agent/platform-media";
import type { WorkflowBackendContext } from "../context";
import { persistGeneratedFile } from "./assets";
import { record, text } from "./shared";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function transcriptText(value: unknown) {
  const payload = record(value);
  const data = record(payload.data);
  return text(
    payload.text || payload.transcript || data.text || data.transcript,
    100_000,
  );
}

function providerTaskStatus(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (normalized === "completed") return "succeed" as const;
  if (normalized === "failed") return "failed" as const;
  return "processing" as const;
}

async function queryProviderTask(
  context: WorkflowBackendContext,
  input: {
    taskId: string;
    type?: string;
    modelId?: string;
    baseUrl?: string;
    projectId?: string;
  },
) {
  const kind = text(input.type, 80).toLowerCase();
  const outputType = kind.includes("audio")
    ? "audio"
    : kind.includes("3d") || kind.includes("world")
      ? "3d"
      : kind.includes("image")
        ? "image"
        : "video";
  const result = await generateCodexPlatformMedia({
    userId: "desktop-user",
    project: {
      id: input.projectId || "zaomeng-desktop-workflow",
      userId: "desktop-user",
      path: context.runtimeRoot,
    },
    body: {
      operation: "status",
      taskId: input.taskId,
      output_type: outputType,
      model: input.modelId,
      baseUrl: input.baseUrl,
    },
  });
  if (result.status === "completed") {
    for (const output of result.outputs) {
      persistGeneratedFile(context, {
        fileType: result.type,
        fileUrl: output.url,
        model: result.model,
        projectId: input.projectId || "zaomeng-desktop-workflow",
        providerTaskId: input.taskId,
      });
    }
  }
  return result;
}

export function registerChatToolRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.post("/api/chat/transcribe-audio", async (c) => {
    try {
      const form = await c.req.formData();
      const value = form.get("audio") || form.get("file");
      if (!(value instanceof Blob))
        return c.json({ error: "Missing audio file" }, 400);
      if (value.size <= 0) return c.json({ error: "Audio file is empty" }, 400);
      if (value.size > MAX_AUDIO_BYTES)
        return c.json({ error: "Audio file is too large" }, 413);
      const provider = context.getProviderConfig();
      if (!provider.baseUrl || !provider.apiKey)
        return c.json({ error: "请先配置当前供应商 API Key" }, 400);
      const upstreamForm = new FormData();
      const file = value as Blob & { name?: string };
      upstreamForm.append(
        "file",
        value,
        file.name || "workflow-voice-input.webm",
      );
      upstreamForm.append("model", text(form.get("model"), 200) || "gpt-4o-transcribe");
      const language = text(form.get("language") || form.get("locale"), 32)
        .split(/[-_]/, 1)[0];
      if (language) upstreamForm.append("language", language);
      const response = await context.fetchRemote(
        provider.baseUrl.replace(/\/+$/, "") + "/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + provider.apiKey },
          body: upstreamForm,
        },
      );
      const payload = await response.json().catch(async () => ({
        error: await response.text().catch(() => ""),
      }));
      if (!response.ok) {
        const error = record(record(payload).error);
        return c.json(
          {
            error:
              text(error.message || record(payload).message || record(payload).error, 2_000) ||
              "语音转写失败: HTTP " + response.status,
          },
          response.status as 400,
        );
      }
      const transcript = transcriptText(payload);
      if (!transcript) throw new Error("语音转写接口没有返回文本");
      return c.json({
        text: transcript,
        model: text(form.get("model"), 200) || "gpt-4o-transcribe",
        provider: "desktop-current-provider",
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/api/chat/task-status", async (c) => {
    try {
      const taskId = text(c.req.query("taskId"), 500);
      if (!taskId) return c.json({ error: "taskId is required" }, 400);
      const result = await queryProviderTask(context, {
        taskId,
        type: c.req.query("type"),
        modelId: c.req.query("modelId"),
        baseUrl: c.req.query("baseUrl"),
        projectId: c.req.query("projectId"),
      });
      const status = providerTaskStatus(result.status);
      const urls = result.outputs.map((item) => item.url).filter(Boolean);
      return c.json({
        success: true,
        status,
        progress: result.progress,
        source: "desktop-current-provider",
        data: {
          task_status: status,
          task_progress: result.progress,
          task_status_msg: result.error || "",
          task_result: {
            images: result.type === "image" ? urls.map((url) => ({ url })) : [],
            videos: result.type === "video" ? urls.map((url) => ({ url })) : [],
            audios: result.type === "audio" ? urls.map((url) => ({ url })) : [],
            models: result.type === "3d" ? urls.map((url) => ({ url })) : [],
          },
        },
        task: {
          id: taskId,
          status: result.status,
          model: result.model,
          error: result.error,
          outputs: urls,
        },
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/api/libtv/audio/tasks/:id", async (c) => {
    try {
      const taskId = c.req.param("id");
      const result = await queryProviderTask(context, {
        taskId,
        type: "audio-generation",
        modelId: c.req.query("modelId"),
        baseUrl: c.req.query("baseUrl"),
        projectId: c.req.query("projectId"),
      });
      const status = providerTaskStatus(result.status);
      return c.json({
        success: status !== "failed",
        status: status === "succeed" ? "success" : status,
        taskId,
        audioUrl: result.outputs[0]?.url || "",
        progress: result.progress,
        error: result.error,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.get("/api/seedance/video-tasks/:id", async (c) => {
    try {
      const taskId = c.req.param("id");
      const result = await queryProviderTask(context, {
        taskId,
        type: "video-generation",
        modelId: c.req.query("modelId"),
        baseUrl: c.req.query("baseUrl"),
        projectId: c.req.query("projectId"),
      });
      const status = providerTaskStatus(result.status);
      const urls = result.outputs.map((item) => item.url).filter(Boolean);
      return c.json({
        success: true,
        source: "desktop-current-provider",
        data: {
          task_status: status,
          task_status_msg: result.error || "",
          task_progress: result.progress,
          task_result: { videos: urls.map((url) => ({ url })) },
        },
        task: {
          id: taskId,
          status: result.status,
          model: result.model,
          videoUrl: urls[0] || "",
          error: result.error || null,
        },
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });
}

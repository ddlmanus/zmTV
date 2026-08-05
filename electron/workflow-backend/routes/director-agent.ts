import type { Hono } from "hono";
import type { WorkflowBackendContext } from "../context";
import { runWorkflowPlatformMedia } from "./generation";
import {
  buildCodexStoryboardPrompt,
  normalizeCodexStoryboardResult,
} from "./libtv-codex";
import { list, record, text } from "./shared";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

function providerModel(value: unknown, fallback: string) {
  let model = text(value, 300).split("@@")[0];
  if (!model) model = text(fallback, 300);
  if (/^(openai|google|anthropic)\//i.test(model))
    model = model.split("/").slice(1).join("/");
  return model;
}

function chatUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized + "/chat/completions";
}

function extractChatText(value: unknown) {
  const payload = record(value);
  const choices = list(payload.choices);
  const first = record(choices[0]);
  const message = record(first.message);
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => text(record(item).text || record(item).content, 100_000))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return text(payload.output_text || payload.text || payload.content, 100_000);
}

export async function workflowChatCompletion(
  context: WorkflowBackendContext,
  input: {
    model?: unknown;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
  },
) {
  const provider = context.getProviderConfig();
  if (!provider.baseUrl || !provider.apiKey)
    throw new Error("请先在设置中配置造梦 API 或 OneAPI/NewAPI 的 API Key");
  const model = providerModel(input.model, provider.model || "gpt-5.6-sol");
  const response = await context.fetchRemote(chatUrl(provider.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + provider.apiKey,
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      stream: false,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens || 4_000,
    }),
  });
  const payload = await response.json().catch(async () => ({
    error: { message: await response.text().catch(() => "") },
  }));
  if (!response.ok) {
    const error = record(record(payload).error);
    throw new Error(
      text(
        error.message || record(payload).message || record(payload).error,
        2_000,
      ) || "文本模型请求失败: HTTP " + response.status,
    );
  }
  const output = extractChatText(payload);
  if (!output) throw new Error("文本模型没有返回内容");
  return { output, model };
}

function jsonObject(value: string) {
  const normalized = value.replace(/^(?:json)?\s*/i, "").replace(/\s*$/i, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return record(JSON.parse(normalized.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function sse(events: Array<Record<string, unknown>>) {
  return new Response(
    events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    },
  );
}

function workflowSourceText(body: Record<string, unknown>) {
  const workflow = record(body.workflow);
  return list(workflow.nodes)
    .map((node) => {
      const data = record(record(node).data);
      return [data.title, data.prompt, data.content, data.note]
        .map((item) => text(item, 5_000))
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function fallbackStaging(body: Record<string, unknown>) {
  const prompt = text(body.prompt, 5_000);
  const poses = list(body.availablePoses).map(record);
  const requested = [
    [/看手机|刷手机|拿手机/, "phone"],
    [/招手|挥手/, "wave"],
    [/坐|坐下/, "sit"],
    [/跑|奔跑/, "run"],
    [/走|行走/, "walk"],
    [/思考|沉思/, "think"],
    [/蹲/, "crouch"],
  ].find(([pattern]) => (pattern as RegExp).test(prompt))?.[1] as
    | string
    | undefined;
  const poseId =
    text(poses.find((pose) => pose.id === requested)?.id, 48) ||
    text(poses.find((pose) => pose.id === "stand")?.id, 48) ||
    text(poses[0]?.id, 48) ||
    "stand";
  const facing = /背对|背向/.test(prompt)
    ? "away"
    : /朝左|看左/.test(prompt)
      ? "left"
      : /朝右|看右/.test(prompt)
        ? "right"
        : /看镜头|面向镜头/.test(prompt)
          ? "camera"
          : "keep";
  return {
    poseId,
    facing,
    scale: /远处|背景/.test(prompt) ? 0.9 : /近处|前景/.test(prompt) ? 1.08 : 1,
    summary: "已按导演指令规划姿势、朝向与画面尺度。",
    source: "rules",
  };
}

export function registerDirectorAgentRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.post("/api/workflow/text-agent", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const prompt = [
        text(body.prompt, 20_000),
        ...list(body.textBlocks).map((item) => text(item, 4_000)),
        ...list(body.videoBlocks).map((item) => text(item, 3_000)),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!prompt) return sse([{ type: "error", message: "请先输入提示词" }]);
      const images = list(body.imageUrls)
        .map((item) => text(item, 20_000))
        .filter(Boolean);
      const content: unknown = images.length
        ? [
            { type: "text", text: prompt },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ]
        : prompt;
      const result = await workflowChatCompletion(context, {
        model: body.modelId,
        messages: [
          {
            role: "system",
            content:
              "你是专业影视导演、编剧和分镜师。输出应可直接用于图片、视频和音频生成，保持角色与场景连续。",
          },
          { role: "user", content },
        ],
        maxTokens: 8_000,
      });
      return sse([
        { type: "delta", text: result.output },
        { type: "done", modelId: result.model },
      ]);
    } catch (error) {
      return sse([
        {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      ]);
    }
  });

  app.post("/api/libtv/script/generate", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const prompt = buildCodexStoryboardPrompt(body);
      const generated = await context.runCodexTask({
        prompt,
        model: providerModel(body.modelId, ""),
        workflowProjectId: text(body.projectId, 191),
        workflowProjectName: "造梦工作流分镜",
        canvasSessionId: text(body.canvasSessionId, 191),
      });
      const parsed = normalizeCodexStoryboardResult(generated.output, {
        title: text(body.title, 200) || "脚本生成器",
        sourceScript: workflowSourceText(body),
        userPrompt: text(body.prompt, 20_000),
        selectedOptionId:
          text(body.selectedOptionId, 120) || "storyboard-script",
      });
      if (!parsed) throw new Error("Codex 未返回可解析的分镜生产包");
      return sse([
        { type: "progress", progress: 100, label: "Codex 分镜制作完成" },
        {
          type: "result",
          result: parsed,
          sourceNodeIds: [],
          executionMode: "desktop-codex",
          codexTaskId: generated.taskId,
          modelId: generated.model,
        },
      ]);
    } catch (error) {
      return sse([
        {
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      ]);
    }
  });

  app.post("/api/workflow/director-staging", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const fallback = fallbackStaging(body);
    if (body.mode === "asset") {
      const characters = list(body.availableCharacters).map(record);
      const requestedCharacter = text(
        record(body.attachment).targetCharacterId,
        100,
      );
      const target =
        characters.find((item) => item.id === requestedCharacter) ||
        characters[0];
      return c.json({
        attachment: {
          enabled: Boolean(target && record(body.attachment).mode !== "none"),
          targetCharacterId: text(target?.id, 100) || undefined,
          attachBone:
            record(body.attachment).mode === "leftHand"
              ? "leftHand"
              : "rightHand",
        },
        targetLongestDimensionMeters: 0.36,
        gripOffset: { x: 0, y: -0.18, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        poseId: fallback.poseId,
        summary: "已按角色手部尺度规划道具尺寸与抓握位置。",
        source: "fallback",
      });
    }
    try {
      const result = await workflowChatCompletion(context, {
        messages: [
          {
            role: "system",
            content:
              "你是 3D 影视预演调度 Agent。只返回 JSON，字段为 poseId, facing, scale, summary。",
          },
          {
            role: "user",
            content:
              "导演指令：" +
              text(body.prompt, 5_000) +
              "\n可用姿势：" +
              JSON.stringify(body.availablePoses || []),
          },
        ],
        maxTokens: 600,
        temperature: 0,
      });
      return c.json({
        ...fallback,
        ...jsonObject(result.output),
        source: "ai",
        modelId: result.model,
      });
    } catch {
      return c.json(fallback);
    }
  });

  app.post("/api/workflow/director-asset", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      if (body.operation === "status" && body.modelUrl) {
        return c.json({
          success: true,
          status: "succeeded",
          modelUrl: body.modelUrl,
        });
      }
      const generated = await runWorkflowPlatformMedia(
        context,
        {
          ...body,
          output_type: "3d",
          prompt: text(body.prompt, 20_000),
          model: text(body.modelRuntimeId || body.modelId, 300),
          reference_images: text(body.referenceImageUrl, 20_000)
            ? [text(body.referenceImageUrl, 20_000)]
            : [],
        },
        text(body.projectId, 191),
      );
      return c.json({
        success: true,
        status: "succeeded",
        taskId: generated.result.taskId,
        baseUrl: generated.result.baseUrl,
        modelRuntimeId: generated.result.model,
        modelUrl: generated.urls[0],
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/workflow/director-character-detection", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const imageUrl = text(body.imageUrl, 20_000);
      if (!imageUrl) return c.json({ error: "请先上传可识别的场景图片" }, 400);
      const result = await workflowChatCompletion(context, {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: '检测图片中每一个可见人物。只返回 JSON：{"projection":"flat","coordinateScale":1000,"characters":[{"id":"person-1","label":"人物","bbox":{"x":0,"y":0,"width":0,"height":0},"footPoint":{"x":0,"y":0},"bodyType":"mannequin","poseId":"stand","facing":"camera","confidence":0.9}]}。坐标均为 0 到 1000 的整数，最多 40 人。',
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        maxTokens: 3_000,
        temperature: 0,
      });
      const parsed = jsonObject(result.output);
      if (!parsed || !Array.isArray(parsed.characters))
        throw new Error("人物检测模型未返回有效 JSON");
      return c.json({
        ok: true,
        source: "ai",
        modelId: result.model,
        projection: text(parsed.projection, 32) || "flat",
        characters: parsed.characters,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/api/prompt/translate", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const input = text(body.prompt || body.text, 20_000);
      const result = await workflowChatCompletion(context, {
        model: body.modelId,
        messages: [
          {
            role: "system",
            content:
              "Translate the user's media-generation prompt into concise professional English. Return only the translation.",
          },
          { role: "user", content: input },
        ],
        maxTokens: 2_000,
        temperature: 0.1,
      });
      return c.json({
        success: true,
        text: result.output,
        prompt: result.output,
        translatedPrompt: result.output,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });

  app.post("/api/seedance/prompt-agent", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const result = await workflowChatCompletion(context, {
        model: body.modelId,
        messages: [
          {
            role: "system",
            content:
              "你是专业视频提示词导演。优化动作、镜头、节奏、光线和声音描述，保留用户原意，只返回优化后的提示词。",
          },
          { role: "user", content: text(body.prompt || body.message, 20_000) },
        ],
        maxTokens: 2_000,
      });
      return c.json({
        success: true,
        prompt: result.output,
        text: result.output,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }
  });
}

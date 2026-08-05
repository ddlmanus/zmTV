import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { Hono } from "hono";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import type { WorkflowBackendContext } from "../context";
import { persistGeneratedFile } from "./assets";
import { workflowChatCompletion } from "./director-agent";
import { runWorkflowPlatformMedia } from "./generation";
import {
  fileStore,
  list,
  record,
  saveWorkflowBuffer,
  text,
} from "./shared";

type MediaMetadata = {
  width: number;
  height: number;
  durationSeconds: number;
  hasAudio: boolean;
};

const ffmpegPath = ffmpegInstaller.path;
const ffprobePath = ffprobeInstaller.path;

function runCommand(command: string, args: string[], timeoutMs = 15 * 60_000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("媒体处理超时"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-16_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || "FFmpeg 执行失败"));
    });
  });
}

async function metadata(filePath: string): Promise<MediaMetadata> {
  const output: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffprobePath, [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      filePath,
    ]);
    child.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("无法读取媒体信息")),
    );
  });
  const parsed = record(JSON.parse(Buffer.concat(output).toString("utf8")));
  const streams = list(parsed.streams).map(record);
  const video = streams.find((stream) => stream.codec_type === "video");
  const duration = Number(record(parsed.format).duration || video?.duration || 0);
  return {
    width: Math.max(0, Number(video?.width || 0)),
    height: Math.max(0, Number(video?.height || 0)),
    durationSeconds: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
  };
}

function dataUrlBuffer(value: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) return null;
  return match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]));
}

async function sourceBuffer(context: WorkflowBackendContext, value: unknown) {
  const source = text(value, 30_000);
  if (!source) throw new Error("媒体地址为空");
  const inline = dataUrlBuffer(source);
  if (inline) return inline;
  if (source.startsWith("zaomeng-workflow://")) {
    const id = decodeURIComponent(new URL(source).pathname.split("/").pop() || "");
    const item = fileStore(context).items.find((row) => row.id === id);
    if (!item || !fs.existsSync(item.path)) throw new Error("本地媒体文件不存在");
    return fs.readFileSync(item.path);
  }
  if (source.startsWith("local-asset://") && !source.startsWith("local-asset://remote/")) {
    const filePath = decodeURIComponent(source.slice("local-asset://".length));
    if (!fs.existsSync(filePath)) throw new Error("本地媒体文件不存在");
    return fs.readFileSync(filePath);
  }
  if (!/^https?:\/\//i.test(source)) throw new Error("不支持的媒体地址");
  const response = await context.fetchRemote(source);
  if (!response.ok) throw new Error("下载媒体失败: HTTP " + response.status);
  return Buffer.from(await response.arrayBuffer());
}

function workDirectory(context: WorkflowBackendContext, prefix: string) {
  const directory = path.join(context.runtimeRoot, "tmp", prefix + "-" + randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function safeTitle(value: unknown, fallback: string) {
  return text(value, 100).replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, "_") || fallback;
}

function saveOutput(
  context: WorkflowBackendContext,
  filePath: string,
  name: string,
  mimeType: string,
  projectId?: string,
) {
  const stored = saveWorkflowBuffer(context, {
    buffer: fs.readFileSync(filePath),
    name,
    mimeType,
  });
  persistGeneratedFile(context, {
    fileType: mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file",
    fileUrl: stored.url,
    fileName: name,
    fileSize: stored.size,
    projectId,
  });
  return stored;
}

function even(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function analysisJson(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return record(JSON.parse(value.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function videoAnalysisShotCount(value: unknown, durationSeconds: number) {
  const requested = Math.floor(Number(value || 0));
  if (Number.isFinite(requested) && requested >= 2) {
    return Math.max(2, Math.min(18, requested));
  }
  if (durationSeconds <= 12) return 4;
  if (durationSeconds <= 30) return 6;
  if (durationSeconds <= 90) return 8;
  return 10;
}

function videoAnalysisTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = Math.floor(safe);
  const milliseconds = Math.round((safe - whole) * 1000);
  return (
    String(Math.floor(whole / 60)).padStart(2, "0") +
    ":" +
    String(whole % 60).padStart(2, "0") +
    "." +
    String(milliseconds).padStart(3, "0")
  );
}

async function extractVideoAnalysisFrames(
  context: WorkflowBackendContext,
  inputPath: string,
  directory: string,
  durationSeconds: number,
  count: number,
) {
  const duration = Math.max(0.1, durationSeconds || count * 3);
  const frames: Array<{
    index: number;
    timestamp: number;
    url: string;
    dataUrl: string;
  }> = [];
  for (let index = 0; index < count; index += 1) {
    const timestamp = Math.max(
      0,
      Math.min(duration - 0.05, ((index + 0.5) / count) * duration),
    );
    const target = path.join(directory, "analysis-frame-" + (index + 1) + ".jpg");
    await runCommand(ffmpegPath, [
      "-hide_banner",
      "-y",
      "-ss",
      timestamp.toFixed(3),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(768,iw)':-2",
      "-q:v",
      "3",
      target,
    ]);
    const bytes = fs.readFileSync(target);
    const stored = saveWorkflowBuffer(context, {
      buffer: bytes,
      name: "video-analysis-frame-" + (index + 1) + ".jpg",
      mimeType: "image/jpeg",
    });
    frames.push({
      index,
      timestamp,
      url: stored.url,
      dataUrl: "data:image/jpeg;base64," + bytes.toString("base64"),
    });
  }
  return frames;
}

function normalizedVideoAnalysisRows(
  value: unknown,
  frames: Array<{ index: number; timestamp: number; url: string }>,
  durationSeconds: number,
) {
  const rows = list(value).map(record);
  if (rows.length !== frames.length) {
    throw new Error("视觉模型返回的分镜数量与关键帧数量不一致");
  }
  const segmentDuration = Math.max(
    0.1,
    (durationSeconds || frames.length * 3) / frames.length,
  );
  return rows.map((row, index) => {
    const visualDescription = text(row.visualDescription, 5_000);
    const storyboardPrompt = text(row.storyboardPrompt, 8_000);
    const motionPrompt = text(row.motionPrompt || row.cameraMovement, 8_000);
    if (!visualDescription || !storyboardPrompt || !motionPrompt) {
      throw new Error("视觉模型返回了不完整的分镜内容");
    }
    const start = index * segmentDuration;
    const end = Math.min(
      durationSeconds || start + segmentDuration,
      start + segmentDuration,
    );
    return {
      ...row,
      shotNumber: String(index + 1),
      startTime: text(row.startTime, 64) || videoAnalysisTime(start),
      endTime: text(row.endTime, 64) || videoAnalysisTime(end),
      duration:
        text(row.duration, 64) || Math.max(0.1, end - start).toFixed(2) + "s",
      visualDescription,
      narrativeContent: text(row.narrativeContent, 5_000),
      referenceImage: frames[index].url,
      storyboardPrompt,
      motionPrompt,
    };
  });
}

export function registerMediaToolRoutes(app: Hono, context: WorkflowBackendContext) {
  app.post("/api/workflow/trim-video", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const start = Math.max(0, Number(body.startSeconds || 0));
    const end = Math.max(0, Number(body.endSeconds || 0));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= 0.05)
      return c.json({ error: "裁剪时间范围无效" }, 400);
    const directory = workDirectory(context, "trim");
    try {
      const input = path.join(directory, "source");
      const output = path.join(directory, "output.mp4");
      fs.writeFileSync(input, await sourceBuffer(context, body.sourceUrl));
      await runCommand(ffmpegPath, [
        "-hide_banner",
        "-y",
        "-ss",
        start.toFixed(3),
        "-i",
        input,
        "-t",
        (end - start).toFixed(3),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ]);
      const info = await metadata(output);
      const saved = saveOutput(
        context,
        output,
        safeTitle(body.title, "trimmed-video") + ".mp4",
        "video/mp4",
        text(body.projectId, 191),
      );
      return c.json({ success: true, url: saved.url, mimeType: "video/mp4", ...info, bytes: saved.size });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  app.post("/api/workflow/crop-video", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const directory = workDirectory(context, "crop");
    try {
      const input = path.join(directory, "source");
      const output = path.join(directory, "output.mp4");
      fs.writeFileSync(input, await sourceBuffer(context, body.sourceUrl));
      const source = await metadata(input);
      const requestedWidth = Math.max(1, Number(body.sourceWidth || source.width));
      const requestedHeight = Math.max(1, Number(body.sourceHeight || source.height));
      const scaleX = source.width / requestedWidth;
      const scaleY = source.height / requestedHeight;
      const x = even(Math.max(0, Number(body.cropX || 0) * scaleX));
      const y = even(Math.max(0, Number(body.cropY || 0) * scaleY));
      const width = even(
        Math.min(source.width - x, Math.max(2, Number(body.cropWidth || source.width) * scaleX)),
      );
      const height = even(
        Math.min(source.height - y, Math.max(2, Number(body.cropHeight || source.height) * scaleY)),
      );
      await runCommand(ffmpegPath, [
        "-hide_banner",
        "-y",
        "-i",
        input,
        "-vf",
        "crop=" + width + ":" + height + ":" + x + ":" + y,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ]);
      const info = await metadata(output);
      const saved = saveOutput(
        context,
        output,
        safeTitle(body.title, "cropped-video") + ".mp4",
        "video/mp4",
        text(body.projectId, 191),
      );
      return c.json({
        success: true,
        url: saved.url,
        mimeType: "video/mp4",
        ...info,
        crop: { x, y, width, height },
        bytes: saved.size,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  app.post("/api/workflow/separate-video-audio", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const mode = text(body.mode, 32) || "audio-video";
    if (!["audio-video", "voice", "background"].includes(mode))
      return c.json({ error: "不支持的音频分离模式" }, 400);
    const directory = workDirectory(context, "separate");
    try {
      if (mode === "voice" || mode === "background") {
        const generated = await runWorkflowPlatformMedia(
          context,
          {
            output_type: "audio",
            mode,
            prompt: mode === "voice" ? "Extract clean dialogue and vocals only." : "Extract background music and ambience without vocals.",
            reference_videos: [text(body.sourceUrl || body.videoUrl, 20_000)],
          },
          text(body.projectId, 191),
        );
        return c.json({
          success: true,
          mode,
          audio: {
            url: generated.urls[0],
            mimeType: "audio/mpeg",
            title: safeTitle(body.title, "视频") + (mode === "voice" ? "_人声" : "_背景音"),
          },
        });
      }
      const input = path.join(directory, "source");
      const silent = path.join(directory, "silent.mp4");
      const audio = path.join(directory, "audio.m4a");
      fs.writeFileSync(input, await sourceBuffer(context, body.sourceUrl || body.videoUrl));
      const info = await metadata(input);
      await Promise.all([
        runCommand(ffmpegPath, [
          "-y",
          "-i",
          input,
          "-map",
          "0:v:0",
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          silent,
        ]),
        runCommand(ffmpegPath, [
          "-y",
          "-i",
          input,
          "-map",
          "0:a:0",
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          audio,
        ]),
      ]);
      const title = safeTitle(body.title, "视频");
      const projectId = text(body.projectId, 191);
      const videoSaved = saveOutput(context, silent, title + "_无声.mp4", "video/mp4", projectId);
      const audioSaved = saveOutput(context, audio, title + "_音频.m4a", "audio/mp4", projectId);
      return c.json({
        success: true,
        mode,
        video: { url: videoSaved.url, mimeType: "video/mp4", title: title + "_无声", ...info, bytes: videoSaved.size },
        audio: { url: audioSaved.url, mimeType: "audio/mp4", title: title + "_音频", durationSeconds: info.durationSeconds, bytes: audioSaved.size },
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  app.post("/api/workflow/remove-video-subtitles", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const directory = workDirectory(context, "remove-subtitles");
    try {
      const input = path.join(directory, "source");
      const output = path.join(directory, "output.mp4");
      fs.writeFileSync(input, await sourceBuffer(context, body.sourceUrl || body.videoUrl));
      const info = await metadata(input);
      const bandHeight = Math.max(64, Math.round(info.height * 0.18));
      const bandY = Math.max(0, info.height - bandHeight - Math.round(info.height * 0.06));
      await runCommand(ffmpegPath, [
        "-y",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        "delogo=x=0:y=" + bandY + ":w=" + info.width + ":h=" + bandHeight + ":show=0,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ]);
      const title = safeTitle(body.title, "视频") + "_去字幕";
      const saved = saveOutput(context, output, title + ".mp4", "video/mp4", text(body.projectId, 191));
      return c.json({
        success: true,
        url: saved.url,
        mimeType: "video/mp4",
        title,
        ...info,
        bytes: saved.size,
        subtitleRegion: { x: 0, y: bandY, width: info.width, height: bandHeight },
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  app.post("/api/workflow/analyze-video", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const directory = workDirectory(context, "analyze");
    try {
      const input = path.join(directory, "source");
      fs.writeFileSync(input, await sourceBuffer(context, body.sourceUrl || body.videoUrl));
      const info = await metadata(input);
      const count = videoAnalysisShotCount(body.shotCount, info.durationSeconds);
      const frames = await extractVideoAnalysisFrames(
        context,
        input,
        directory,
        info.durationSeconds,
        count,
      );
      const segmentDuration = Math.max(
        0.1,
        (info.durationSeconds || count * 3) / count,
      );
      const timing = frames
        .map((_, index) => {
          const start = index * segmentDuration;
          const end = Math.min(
            info.durationSeconds || start + segmentDuration,
            start + segmentDuration,
          );
          return (
            index +
            1 +
            ". " +
            videoAnalysisTime(start) +
            " - " +
            videoAnalysisTime(end)
          );
        })
        .join("\n");
      const analysis = await workflowChatCompletion(context, {
        messages: [
          {
            role: "system",
            content:
              "你是专业视频分镜解析师。根据真实关键帧识别画面，只输出合法 JSON，不要 Markdown。",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "按顺序分析这些视频关键帧并返回 JSON。顶层必须包含 title、summary、rows；rows 必须恰好 " +
                  count +
                  " 条。每条必须包含 visualDescription、narrativeContent、shotType、cameraAngle、cameraMovement、focalDepth、characterAction、emotion、sceneTags、lightingAtmosphere、musicRhythm、voice、soundEffect、dialogue、subtitleText、subtitleStartTime、subtitleEndTime、subtitleSpeaker、storyboardPrompt、motionPrompt。visualDescription 必须描述真实可见内容；storyboardPrompt 必须完整描述主体、场景、构图、光影和风格；motionPrompt 必须描述主体运动、镜头运动和节奏。看不清的声音或字幕字段写空字符串，禁止编造。时间段：\n" +
                  timing,
              },
              ...frames.map((frame) => ({
                type: "image_url",
                image_url: { url: frame.dataUrl },
              })),
            ],
          },
        ],
        maxTokens: Math.min(8_000, 2_000 + count * 450),
        temperature: 0.1,
      });
      const parsed = analysisJson(analysis.output);
      if (!parsed) throw new Error("视觉模型没有返回可解析的分镜 JSON");
      const rows = normalizedVideoAnalysisRows(
        parsed.rows,
        frames,
        info.durationSeconds,
      );
      return c.json({
        success: true,
        result: {
          title: text(parsed.title, 200) || safeTitle(body.title, "视频故事"),
          summary: text(parsed.summary, 5_000),
          sourceScript: "",
          userPrompt: "",
          selectedOptionId: "video-analysis",
          rows,
          generatedAt: Date.now(),
        },
        metadata: info,
        frameCount: frames.length,
        modelId: analysis.model,
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  app.post("/api/workflow/playlist-export", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const items = list(body.items).map(record).filter((item) => text(item.mediaUrl, 20_000));
    if (!items.length) return c.json({ error: "播放列表为空" }, 400);
    const directory = workDirectory(context, "playlist");
    try {
      const prepared: Array<{ path: string; info: MediaMetadata; duration: number; start: number }> = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const input = path.join(directory, "source-" + index);
        fs.writeFileSync(input, await sourceBuffer(context, item.mediaUrl));
        const info = await metadata(input);
        const start = Math.max(0, Number(item.trimStart || 0));
        const end = Math.min(info.durationSeconds || Number(item.duration || 5), Number(item.trimEnd || info.durationSeconds || item.duration || 5));
        prepared.push({ path: input, info, start, duration: Math.max(0.05, end - start) });
      }
      const width = even(prepared[0].info.width || 1280);
      const height = even(prepared[0].info.height || 720);
      const args = ["-y", ...prepared.flatMap((item) => ["-i", item.path])];
      const filters: string[] = [];
      prepared.forEach((item, index) => {
        filters.push(
          "[" + index + ":v:0]trim=start=" + item.start.toFixed(3) + ":duration=" + item.duration.toFixed(3) + ",setpts=PTS-STARTPTS,scale=" + width + ":" + height + ":force_original_aspect_ratio=decrease,pad=" + width + ":" + height + ":(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v" + index + "]",
        );
        if (item.info.hasAudio)
          filters.push("[" + index + ":a:0]atrim=start=" + item.start.toFixed(3) + ":duration=" + item.duration.toFixed(3) + ",asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a" + index + "]");
        else
          filters.push("anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=" + item.duration.toFixed(3) + "[a" + index + "]");
      });
      filters.push(prepared.map((_, index) => "[v" + index + "][a" + index + "]").join("") + "concat=n=" + prepared.length + ":v=1:a=1[outv][outa]");
      const output = path.join(directory, "playlist.mp4");
      await runCommand(ffmpegPath, [
        ...args,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ]);
      const info = await metadata(output);
      const saved = saveOutput(context, output, safeTitle(body.title, "playlist") + ".mp4", "video/mp4");
      return c.json({ success: true, url: saved.url, mimeType: "video/mp4", ...info, bytes: saved.size });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

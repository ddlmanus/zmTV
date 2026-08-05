import type { Hono } from "hono";
import type { WorkflowBackendContext } from "../context";
import {
  classifyPlatformCharacterFile,
  importPlatformFile,
  platformJson,
  uploadPlatformFile,
} from "../platform-assets";
import { record, text } from "./shared";

function unsupportedAssetList(kind: "elements" | "voices") {
  return {
    success: true,
    supported: false,
    reason: "当前供应商模型目录没有提供可验证的 Kling 自定义素材管理接口",
    list: [],
    [kind]: [],
  };
}

export function registerProviderAssetRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.get("/api/platform/files", async (c) => {
    try {
      const query = new URLSearchParams();
      for (const key of [
        "page",
        "page_size",
        "asset_type",
        "validation_status",
      ]) {
        const value = text(c.req.query(key), 100);
        if (value) query.set(key, value);
      }
      const suffix = query.size ? "?" + query.toString() : "";
      return c.json(await platformJson(context, "/files" + suffix));
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.post("/api/platform/files", async (c) => {
    try {
      const form = await c.req.formData();
      const value = form.get("file");
      if (!(value instanceof Blob))
        return c.json({ error: "file is required" }, 400);
      const filename =
        typeof File !== "undefined" && value instanceof File && value.name
          ? value.name
          : text(form.get("filename"), 255) || "workflow-upload";
      return c.json(await uploadPlatformFile(context, value, filename), 201);
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.post("/api/platform/files/import", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      const sourceUrl = text(body.url, 20_000);
      if (!sourceUrl) return c.json({ error: "url is required" }, 400);
      return c.json(
        await importPlatformFile(context, sourceUrl, text(body.filename, 255)),
        201,
      );
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.get("/api/platform/files/:id", async (c) => {
    try {
      return c.json(
        await platformJson(
          context,
          "/files/" + encodeURIComponent(c.req.param("id")),
        ),
      );
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.delete("/api/platform/files/:id", async (c) => {
    try {
      await platformJson(
        context,
        "/files/" + encodeURIComponent(c.req.param("id")),
        {
          method: "DELETE",
        },
      );
      return c.body(null, 204);
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.post("/api/platform/files/:id/classify-character", async (c) => {
    try {
      return c.json(
        await classifyPlatformCharacterFile(context, c.req.param("id")),
      );
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.post("/api/platform/files/:id/seedance-validation", async (c) => {
    try {
      const id = encodeURIComponent(c.req.param("id"));
      return c.json(
        await platformJson(context, "/files/" + id + "/seedance-validation", {
          method: "POST",
        }),
        202,
      );
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.get("/api/platform/files/:id/seedance-validation", async (c) => {
    try {
      const id = encodeURIComponent(c.req.param("id"));
      return c.json(
        await platformJson(context, "/files/" + id + "/seedance-validation"),
      );
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.post("/api/seedance/avatar", async (c) => {
    try {
      const body = record(await c.req.json().catch(() => ({})));
      if (body.mode === "real") {
        return c.json(
          {
            ok: false,
            error:
              "当前供应商未提供真人扫码授权接口，不能生成虚假的授权二维码或素材组 ID",
          },
          501,
        );
      }
      return c.json(
        {
          ok: false,
          error:
            "旧的 URL 合规提交接口已移除，请先通过 /api/platform/files 上传并使用 fileId 校验",
        },
        410,
      );
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.get("/api/seedance/avatar", async (c) => {
    return c.json(
      {
        error:
          "旧的任务查询接口已移除，请使用 /api/platform/files/:id/seedance-validation",
      },
      410,
    );
  });

  app.get("/api/seedance/video-tasks", (c) =>
    c.json({ success: true, items: [] }),
  );
  app.delete("/api/seedance/video-tasks/:id", (c) =>
    c.json(
      {
        error: "当前桌面供应商协议未声明远程任务删除能力，未执行任何删除操作",
      },
      501,
    ),
  );

  app.get("/api/kling/custom-elements", (c) =>
    c.json(unsupportedAssetList("elements")),
  );
  app.post("/api/kling/custom-elements", (c) =>
    c.json(
      {
        error:
          "当前供应商没有可验证的 Kling 自定义主体创建接口，未创建虚假主体 ID",
      },
      501,
    ),
  );
  app.delete("/api/kling/custom-elements", (c) =>
    c.json({ error: "当前供应商不支持 Kling 自定义主体删除" }, 501),
  );

  app.get("/api/kling/custom-voices", (c) =>
    c.json(unsupportedAssetList("voices")),
  );
  app.post("/api/kling/custom-voices", (c) =>
    c.json(
      {
        error:
          "当前供应商没有可验证的 Kling 自定义音色创建接口，未创建虚假音色 ID",
      },
      501,
    ),
  );
  app.delete("/api/kling/custom-voices", (c) =>
    c.json({ error: "当前供应商不支持 Kling 自定义音色删除" }, 501),
  );
}

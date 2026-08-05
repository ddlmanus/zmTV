# 模型与供应商接入

zmTV 将供应商差异封装在 API 与桌面工作流后端中。画布消费统一的模型目录、任务提交、任务轮询、价格和输出结构。

## 接入原则

1. 只通过 Base URL 与 API Key 判断一个兼容服务，不按域名猜测供应商能力。
2. 模型版本保持独立；不要把名称相似但 endpoint 不同的模型合并。
3. 模式来自当前模型 endpoints，参数来自当前 endpoint schema。
4. 前端不保存 OSS Secret，不直接调用需要服务端凭据的上传接口。
5. 提交与轮询都必须归一化图片、视频、音频、3D 和数字人结果。
6. 价格使用供应商返回的美元计价与模型公式，不在前端换算人民币。

## 主要代码位置

| 位置                                 | 职责                                     |
| ------------------------------------ | ---------------------------------------- |
| `src/api/client.ts`                  | 服务选择、认证、模型与任务统一客户端     |
| `src/api/providers/oneApi/`          | One API / New API 模型、计费与生成适配   |
| `src/api/platformMedia.ts`           | 平台媒体模型目录和任务调用               |
| `src/workflow/ideart/lib/wavespeed/` | 工作流模型路由、schema 与请求构建        |
| `src/workflow/backend/client.ts`     | 渲染进程工作流请求桥接                   |
| `electron/workflow-backend/`         | 本地路由、上传、任务轮询、Codex 与持久化 |

## 模型目录

标准模型记录至少应包含：

```ts
type ModelRecord = {
  id: string;
  name: string;
  mediaType: "image" | "video" | "audio" | "3d" | "digital-human";
  endpoints: Array<{
    id: string;
    mode: string;
    path: string;
    inputSchema: Record<string, unknown>;
  }>;
  pricing?: Record<string, unknown>;
};
```

模型选择器先按 `mediaType` 过滤，模式选择器再读取当前模型的 `endpoints`。切换 endpoint 后重建参数默认值，避免继承上一个模式不支持的字段。

## 任务生命周期

```text
提交生成
  -> 归一化 taskId / predictionId
  -> 保存任务与节点关联
  -> 按供应商路由轮询
  -> 归一化 processing / success / failed
  -> 上传或持久化结果 URL
  -> 更新历史和画布节点
```

页面切换后仍要使用保存的任务关联恢复轮询，不能只依赖组件内 Promise。

## 文件上传

远程生成模型通常无法访问本地文件。推荐流程：

```text
本地文件 -> 桌面主进程 -> 平台上传接口 -> 公网 URL -> 供应商请求
```

上传凭据只存在桌面主进程环境或平台服务端。渲染进程只接收上传结果，不接收 Secret。

## 新增兼容供应商

1. 在服务配置中增加显示项和 Base URL。
2. 实现凭据验证与余额读取。
3. 实现模型目录获取与媒体类型归一化。
4. 实现各媒体任务提交。
5. 实现同步响应和异步任务轮询。
6. 实现价格读取与美元展示。
7. 用至少一个模型验证目录、参数、提交、轮询、历史和画布回填。

不要把测试密钥提交到仓库。测试后应轮换临时密钥，并使用环境变量或桌面安全存储。

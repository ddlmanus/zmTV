export type WorkflowPlatformMediaBody = Record<string, unknown> & {
  output_type?: string;
  outputType?: string;
  type?: string;
  prompt?: string;
  model?: string;
  model_id?: string;
  modelId?: string;
  count?: number;
};

export type WorkflowPlatformMediaRequest = {
  requestId: string;
  projectId?: string;
  projectPath?: string;
  body: WorkflowPlatformMediaBody;
};

export type WorkflowPlatformMediaResult = {
  ok: boolean;
  type: "image" | "video" | "audio" | "3d";
  status?: "queued" | "processing" | "completed" | "failed";
  taskId?: string;
  error?: string;
  progress?: number;
  baseUrl?: string;
  model?: string;
  mode?: string;
  parameters?: Record<string, unknown>;
  outputs: Array<{
    url: string;
    viewUrl?: string;
    sourceUrl?: string;
  }>;
};

export type WorkflowPlatformMediaResponse =
  | { ok: true; result: WorkflowPlatformMediaResult }
  | { ok: false; error: string };

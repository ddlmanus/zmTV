"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_TAPNOW_SCRIPT_HEIGHT,
  LIBTV_TAPNOW_SCRIPT_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import {
  createEmptyStoryboardScriptRow,
  type LibTvScriptV2AssetItem,
  type LibTvScriptV2AssetKind,
  type LibTvStoryboardScriptColumnKey,
  type LibTvStoryboardScriptRow,
} from "@/workflow/ideart/lib/libtv/script";
import {
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
} from "./workflow-extra-parameters";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  ScriptV2Workspace,
  type ScriptV2CanvasImageAsset,
  type ScriptV2WorkspaceStep,
} from "./nodes/script-v2-workspace";
import { BatchStoryboardImageModal } from "./nodes/batch-storyboard-image-modal";
import { stopWorkflowNodeChromeEvent } from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_STYLE,
  getWorkflowNodeTitleWidth,
  getWorkflowScriptNodeTitle,
} from "./workflow-connections";
import {
  fetchWorkflowModelOptions,
  findWorkflowModelOptionByIdentity,
  getWorkflowManagedExtraParameterValues,
  getWorkflowModelOptionValue,
  isWorkflowModelFree,
  resolveWorkflowImageExecutionRoute,
} from "./workflow-models";
import {
  getWorkflowImageNonQualityDefinitions,
  getWorkflowImageQualityChoices,
  getWorkflowImageQualityDefinition,
  normalizeGenerationCountOptions,
  normalizeWorkflowRedrawChoicesForMethod,
  pickWorkflowRedrawDefault,
} from "./generation-options";
import { isRenderableWorkflowMediaUrl } from "./workflow-media-utils";
import {
  SCRIPT_V2_VISIBLE_COLUMN_KEYS,
  WorkflowScriptTable,
  createWorkflowScriptV2Result,
  downloadWorkflowScriptResult,
} from "./script-node";
import { ZMTV_NODE_SURFACE_SELECTED_OUTLINE } from "./node-shared-ui";
import { NodeGenerationBar } from "./generation-composer";
import { BatchStoryboardVideoModal } from "./generation-popovers";
import type {
  ScriptInputCreationType,
  ScriptV2AssetImportRequest,
  WorkflowModelOption,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";
import type {
  WorkflowGenerateNodeHandler,
  WorkflowStoryboardGenerateRequest,
  WorkflowStoryboardVideoGenerateRequest,
  WorkflowStoryboardVideoGroupSummary,
} from "./surface-contracts";

export function ScriptV2ToolbarRefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M17.7334 4.57617C17.8781 4.32816 18.229 4.3092 18.3857 4.5498C19.4069 6.11761 20 7.98945 20 10C20 15.5228 15.5228 20 10 20C8.11866 19.9999 6.36021 19.478 4.85742 18.5742C4.67565 18.4649 4.61979 18.2297 4.72559 18.0459L5.22266 17.1846C5.33842 16.9841 5.60012 16.9241 5.79883 17.043C7.02753 17.7777 8.46437 18.2001 10 18.2002C14.5287 18.2002 18.2002 14.5287 18.2002 10C18.2002 9.78474 18.1911 9.57141 18.1748 9.36035H15.6387C15.3299 9.36035 15.1374 9.02545 15.293 8.75879L17.7334 4.57617ZM10 0C12.0448 0 13.9455 0.615472 15.5293 1.66895C15.7004 1.78277 15.7492 2.01049 15.6465 2.18848L15.1484 3.05078C15.0284 3.25841 14.7541 3.31375 14.5547 3.18066C13.252 2.30896 11.6851 1.7998 10 1.7998C5.4715 1.80006 1.79984 5.47145 1.7998 10C1.7998 10.3382 1.82051 10.6716 1.86035 10.999H4.83789C5.06929 10.9991 5.21323 11.2502 5.09668 11.4502L2.5459 15.8271C2.4054 16.0682 2.06736 16.0947 1.90332 15.8691C0.706494 14.2209 0 12.1928 0 10C3.91677e-05 4.47734 4.47739 0.000252248 10 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ScriptV2ToolbarStoryboardIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1.01em"
      height="1em"
      viewBox="0 0 21.2473 21.2471"
    >
      <path
        d="M10.5996 1.2471C10.8204 1.2471 10.9998 1.42574 11 1.64652V2.64652C11 2.86743 10.8205 3.04691 10.5996 3.04691H6.92383L6.90039 19.4473H13.1006L13.0996 10.6465C13.0998 10.4257 13.2792 10.2471 13.5 10.2471H14.5C14.7208 10.2471 14.9002 10.4257 14.9004 10.6465V13.6162H18.2002V10.6465C18.2004 10.4257 18.3798 10.2471 18.6006 10.2471H19.5996C19.8204 10.2471 19.9998 10.4257 20 10.6465V18.2168L19.9961 18.3731C19.9172 19.9221 18.6751 21.1645 17.126 21.2432L16.9697 21.2471H3.03027C1.40921 21.2471 0.0853847 19.9739 0.00390625 18.3731L0 18.2168V4.27738C0.000169039 2.60394 1.3568 1.24712 3.03027 1.2471H10.5996ZM1.7998 18.2168C1.79998 18.8961 2.35092 19.4473 3.03027 19.4473H5.09961L5.10547 15.417H1.7998V18.2168ZM14.9004 19.4473H16.9697C17.6491 19.4473 18.2 18.8961 18.2002 18.2168V15.417H14.9004V19.4473ZM1.7998 13.6162H5.1084L5.11621 8.41703H1.7998V13.6162ZM16.625 0.260776C16.754 -0.0869253 17.246 -0.0869256 17.375 0.260776L18.2871 2.72464C18.3277 2.83385 18.4142 2.92053 18.5234 2.96097L20.9863 3.8721C21.3343 4.00103 21.3343 4.49312 20.9863 4.6221L18.5234 5.53421C18.414 5.57474 18.3276 5.66109 18.2871 5.77054L17.375 8.23343C17.246 8.58133 16.754 8.58133 16.625 8.23343L15.7129 5.77054C15.6724 5.66109 15.586 5.57474 15.4766 5.53421L13.0137 4.6221C12.6657 4.49312 12.6657 4.00103 13.0137 3.8721L15.4766 2.96097C15.5858 2.92053 15.6723 2.83385 15.7129 2.72464L16.625 0.260776ZM3.03027 3.04691C2.35091 3.04693 1.79997 3.59805 1.7998 4.27738V6.61625H5.11816L5.12305 3.04691H3.03027Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ScriptV2ToolbarVideoIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1.02em"
      height="1em"
      viewBox="0 0 21.2473 20.9405"
    >
      <path
        d="M10.5996 0.940464C10.8204 0.940464 10.9998 1.11914 11 1.33988V2.33988C11 2.56079 10.8205 2.74027 10.5996 2.74027H3.03027C2.35093 2.74028 1.80001 3.29144 1.7998 3.97074V17.9102C1.79983 18.0171 1.81517 18.1209 1.84082 18.2198L11.6465 9.30667C12.0831 8.90987 12.7279 8.85964 13.2178 9.17093L13.3145 9.23734L18.2002 12.9961V10.6465C18.2004 10.4258 18.3798 10.2471 18.6006 10.2471H19.5996C19.8204 10.2471 19.9998 10.4258 20 10.6465V17.9102L19.9961 18.0664C19.9173 19.6155 18.6751 20.8579 17.126 20.9366L16.9697 20.9405H3.03027C1.40918 20.9404 0.0853408 19.6673 0.00390625 18.0664L0 17.9102V3.97074C0.000202052 2.29733 1.35682 0.94048 3.03027 0.940464H10.5996ZM3.50488 19.1407H16.9697C17.6491 19.1406 18.2001 18.5895 18.2002 17.9102V15.2666L12.5479 10.918L3.50488 19.1407ZM6 5.2471C7.10448 5.2471 7.99985 6.14266 8 7.2471C7.99989 8.35158 7.1045 9.2471 6 9.2471C4.8955 9.2471 4.00011 8.35158 4 7.2471C4.00015 6.14266 4.89552 5.2471 6 5.2471ZM16.625 0.260776C16.754 -0.0869253 17.246 -0.0869256 17.375 0.260776L18.2871 2.72464C18.3277 2.83388 18.4141 2.92052 18.5234 2.96097L20.9863 3.8721C21.3344 4.00101 21.3343 4.49311 20.9863 4.6221L18.5234 5.53421C18.414 5.57474 18.3276 5.66108 18.2871 5.77054L17.375 8.23343C17.2461 8.58143 16.7539 8.58143 16.625 8.23343L15.7129 5.77054C15.6724 5.66108 15.586 5.57474 15.4766 5.53421L13.0137 4.6221C12.6657 4.49311 12.6656 4.00101 13.0137 3.8721L15.4766 2.96097C15.5859 2.92052 15.6723 2.83388 15.7129 2.72464L16.625 0.260776Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ScriptV2ToolbarDownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="1em"
      height="1em"
      viewBox="0 0 19.8008 19.9004"
    >
      <path
        d="M1.80078 17C1.80078 17.2917 1.91676 17.5711 2.12305 17.7773C2.32934 17.9836 2.60865 18.0996 2.90039 18.0996H16.9004C17.1921 18.0996 17.4714 17.9836 17.6777 17.7773C17.884 17.5711 18 17.2917 18 17V13H19.8008V17C19.8008 17.7691 19.495 18.5069 18.9512 19.0508C18.4073 19.5946 17.6695 19.9004 16.9004 19.9004H2.90039C2.13126 19.9004 1.39346 19.5946 0.849609 19.0508C0.305754 18.5069 0 17.7691 0 17V13H1.80078V17ZM10.8008 11.8262L14.2637 8.36328L15.5371 9.63672L10.5371 14.6367C10.1856 14.9882 9.61514 14.9882 9.26367 14.6367L4.26367 9.63672L5.53711 8.36328L9 11.8262V0H10.8008V11.8262Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ScriptV2StageReadyIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M3.5 8.1 6.7 11.3 12.6 4.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function TapNowScriptV2Node({
  node,
  selected,
  showFloatingControls,
  dragging,
  nodeEventsSuppressed,
  upstreamNodes,
  canvasImageAssets,
  storyboardVideoGroups,
  onUpdateNode,
  onImportScriptV2Assets,
  onGenerateNode,
  onGenerateStoryboard,
  onGenerateStoryboardVideos,
  projectId,
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  showFloatingControls: boolean;
  dragging: boolean;
  nodeEventsSuppressed?: boolean;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  canvasImageAssets?: ScriptV2CanvasImageAsset[];
  storyboardVideoGroups?: WorkflowStoryboardVideoGroupSummary[];
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onImportScriptV2Assets?: (
    sourceId: string,
    request: ScriptV2AssetImportRequest,
  ) => void;
  onCreateScriptInputNode?: (
    id: string,
    type: ScriptInputCreationType,
    initialContent?: string,
  ) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onGenerateStoryboard?: (
    id: string,
    request: WorkflowStoryboardGenerateRequest,
  ) => void;
  onGenerateStoryboardVideos?: (
    id: string,
    request: WorkflowStoryboardVideoGenerateRequest,
  ) => void;
  projectId?: string;
}) {
  const [title, setTitle] = useState(
    getWorkflowScriptNodeTitle(node.data?.title || "脚本生成器"),
  );
  const [scriptFullscreenOpen, setScriptFullscreenOpen] = useState(false);
  const [batchStoryboardOpen, setBatchStoryboardOpen] = useState(false);
  const [batchStoryboardModelOptions, setBatchStoryboardModelOptions] =
    useState<WorkflowModelOption[]>([]);
  const [batchStoryboardModelsLoading, setBatchStoryboardModelsLoading] =
    useState(false);
  const [batchStoryboardModelId, setBatchStoryboardModelId] = useState("");
  const [batchStoryboardQuality, setBatchStoryboardQuality] = useState("");
  const [batchStoryboardImageSize, setBatchStoryboardImageSize] = useState("");
  const [batchStoryboardAspectRatio, setBatchStoryboardAspectRatio] =
    useState("");
  const [batchStoryboardGenerationCount, setBatchStoryboardGenerationCount] =
    useState<number>();
  const [batchStoryboardWebSearch, setBatchStoryboardWebSearch] =
    useState<boolean>();
  const [batchStoryboardExtraParameters, setBatchStoryboardExtraParameters] =
    useState<LibTvWorkflowNode["data"]["workflowExtraParameters"]>();
  const [batchVideoOpen, setBatchVideoOpen] = useState(false);
  const [batchVideoModelId, setBatchVideoModelId] = useState("");
  const [batchVideoAspectRatio, setBatchVideoAspectRatio] = useState("");
  const [batchVideoResolution, setBatchVideoResolution] = useState("");
  const [batchVideoDuration, setBatchVideoDuration] = useState("");
  const [batchVideoMethod, setBatchVideoMethod] = useState("");
  const [batchVideoGenerationCount, setBatchVideoGenerationCount] =
    useState<number>();
  const [batchVideoGenerateAudio, setBatchVideoGenerateAudio] =
    useState<boolean>();
  const [batchVideoWebSearch, setBatchVideoWebSearch] = useState<boolean>();
  const [batchVideoExtraParameters, setBatchVideoExtraParameters] =
    useState<LibTvWorkflowNode["data"]["workflowExtraParameters"]>();
  const [localPreparingAssets, setLocalPreparingAssets] = useState(false);
  const prompt = String(node.data?.prompt || "");
  const scriptResult = node.data?.scriptResult || null;
  const showNodeChrome = !nodeEventsSuppressed && !dragging;
  const scriptRows = Array.isArray(scriptResult?.rows) ? scriptResult.rows : [];
  const scriptV2AssetsByKind =
    (node.data as any)?.scriptV2AssetsByKind &&
    typeof (node.data as any).scriptV2AssetsByKind === "object"
      ? ((node.data as any).scriptV2AssetsByKind as Record<string, unknown[]>)
      : {};
  const scriptV2AssetCount = ["角色", "场景", "道具"].reduce(
    (sum, key) =>
      sum +
      (Array.isArray(scriptV2AssetsByKind[key])
        ? scriptV2AssetsByKind[key].length
        : 0),
    0,
  );
  const scriptV2PromptCount = scriptRows.filter((row) =>
    String(row.storyboardPrompt || "").trim(),
  ).length;
  const scriptV2ActiveStep = String(
    (node.data as any)?.scriptV2ActiveStep || "",
  ).trim();
  const stageActiveIndex =
    scriptV2PromptCount > 0 || scriptV2ActiveStep === "compose-prompts"
      ? 2
      : scriptV2AssetCount > 0 || scriptV2ActiveStep === "prepare-assets"
        ? 1
        : 0;
  const hasScriptRows = scriptRows.length > 0;
  const hasPromptRows = scriptV2PromptCount > 0;
  const generationRunning = Boolean(node.data?.workflowGenerationRunning);
  const preparingAssets =
    localPreparingAssets ||
    (generationRunning && String(node.data?.note || "").includes("提取"));
  const canBatchStoryboard =
    hasScriptRows && !generationRunning && Boolean(onGenerateStoryboard);
  const linkedStoryboardVideoGroup = useMemo(() => {
    const groups = storyboardVideoGroups || [];
    if (groups.length === 0) return null;
    return groups.find((group) => group.items.length > 0) || groups[0] || null;
  }, [storyboardVideoGroups]);
  const canBatchVideo =
    hasPromptRows && !generationRunning && Boolean(onGenerateStoryboardVideos);

  useEffect(() => {
    if (!batchVideoOpen || !linkedStoryboardVideoGroup) return;
    setBatchVideoModelId(
      String(
        linkedStoryboardVideoGroup.modelId ||
          (node.data as any)?.storyboardVideoModelId ||
          batchVideoModelId ||
          "",
      ),
    );
    setBatchVideoAspectRatio(
      String(
        linkedStoryboardVideoGroup.aspectRatio ||
          (node.data as any)?.storyboardVideoAspectRatio ||
          batchVideoAspectRatio ||
          "",
      ),
    );
    setBatchVideoResolution(
      String(
        linkedStoryboardVideoGroup.videoResolution ||
          (node.data as any)?.storyboardVideoResolution ||
          batchVideoResolution ||
          "",
      ),
    );
    setBatchVideoDuration(
      String(
        linkedStoryboardVideoGroup.videoDuration ||
          (node.data as any)?.storyboardVideoDuration ||
          batchVideoDuration ||
          "",
      ),
    );
    setBatchVideoMethod(
      String(
        linkedStoryboardVideoGroup.videoMethod ||
          (node.data as any)?.storyboardVideoMethod ||
          batchVideoMethod ||
          "",
      ),
    );
    setBatchVideoGenerationCount(
      linkedStoryboardVideoGroup.generationCount ||
        Number((node.data as any)?.storyboardVideoGenerationCount) ||
        batchVideoGenerationCount,
    );
    setBatchVideoGenerateAudio(
      typeof linkedStoryboardVideoGroup.generateAudio === "boolean"
        ? linkedStoryboardVideoGroup.generateAudio
        : typeof (node.data as any)?.storyboardVideoGenerateAudio === "boolean"
          ? Boolean((node.data as any).storyboardVideoGenerateAudio)
          : batchVideoGenerateAudio,
    );
    setBatchVideoWebSearch(
      typeof linkedStoryboardVideoGroup.enableWebSearch === "boolean"
        ? linkedStoryboardVideoGroup.enableWebSearch
        : typeof (node.data as any)?.storyboardVideoWebSearch === "boolean"
          ? Boolean((node.data as any).storyboardVideoWebSearch)
          : batchVideoWebSearch,
    );
    setBatchVideoExtraParameters(
      linkedStoryboardVideoGroup.workflowExtraParameters ||
        ((node.data as any)
          ?.storyboardVideoExtraParameters as LibTvWorkflowNode["data"]["workflowExtraParameters"]) ||
        batchVideoExtraParameters,
    );
  }, [
    batchVideoAspectRatio,
    batchVideoDuration,
    batchVideoExtraParameters,
    batchVideoGenerateAudio,
    batchVideoGenerationCount,
    batchVideoMethod,
    batchVideoModelId,
    batchVideoOpen,
    batchVideoResolution,
    batchVideoWebSearch,
    linkedStoryboardVideoGroup,
    node.data,
  ]);

  useEffect(() => {
    setTitle(getWorkflowScriptNodeTitle(node.data?.title || "脚本生成器"));
  }, [node.data?.title]);

  useEffect(() => {
    if (!localPreparingAssets) return;
    if (
      scriptV2ActiveStep === "prepare-assets" ||
      String(node.data?.workflowGenerationError || "").trim()
    ) {
      setLocalPreparingAssets(false);
    }
  }, [
    localPreparingAssets,
    node.data?.workflowGenerationError,
    scriptV2ActiveStep,
  ]);

  useEffect(() => {
    if (!batchStoryboardOpen) return;
    let cancelled = false;
    const persisted = node.data as Record<string, any>;
    if (typeof persisted.storyboardImageAspectRatio === "string")
      setBatchStoryboardAspectRatio(persisted.storyboardImageAspectRatio);
    if (typeof persisted.storyboardImageSize === "string")
      setBatchStoryboardImageSize(persisted.storyboardImageSize);
    if (typeof persisted.storyboardImageQuality === "string")
      setBatchStoryboardQuality(persisted.storyboardImageQuality);
    if (Number.isFinite(Number(persisted.storyboardImageGenerationCount)))
      setBatchStoryboardGenerationCount(
        Math.max(
          1,
          Math.round(Number(persisted.storyboardImageGenerationCount)),
        ),
      );
    if (typeof persisted.storyboardImageWebSearch === "boolean")
      setBatchStoryboardWebSearch(persisted.storyboardImageWebSearch);
    if (
      persisted.storyboardImageExtraParameters &&
      typeof persisted.storyboardImageExtraParameters === "object" &&
      !Array.isArray(persisted.storyboardImageExtraParameters)
    ) {
      setBatchStoryboardExtraParameters(
        persisted.storyboardImageExtraParameters,
      );
    }
    setBatchStoryboardModelsLoading(true);
    fetchWorkflowModelOptions("image")
      .then((models) => {
        if (cancelled) return;
        setBatchStoryboardModelOptions(models);
        const current = String(
          (node.data as any)?.storyboardImageModelId || "",
        ).trim();
        const selected =
          findWorkflowModelOptionByIdentity(models, current) ||
          models.find((model) => model.isDefault) ||
          models[0];
        const value = getWorkflowModelOptionValue(selected);
        if (value) setBatchStoryboardModelId(value);
      })
      .catch((error) => {
        console.error(
          "[LibTvWorkflowSurface] failed to load storyboard image models",
          error,
        );
        message.error("图片模型加载失败");
      })
      .finally(() => {
        if (!cancelled) setBatchStoryboardModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchStoryboardOpen, node.data]);

  const batchStoryboardSelectedModel = useMemo(
    () =>
      findWorkflowModelOptionByIdentity(
        batchStoryboardModelOptions,
        batchStoryboardModelId,
      ) ||
      batchStoryboardModelOptions.find((model) => model.isDefault) ||
      batchStoryboardModelOptions[0] ||
      null,
    [batchStoryboardModelId, batchStoryboardModelOptions],
  );
  const batchStoryboardReferenceImageCount =
    scriptV2AssetCount +
    scriptRows.filter((row) => String(row.referenceImage || "").trim()).length;
  const batchStoryboardImageRoute = useMemo(
    () =>
      resolveWorkflowImageExecutionRoute(
        batchStoryboardSelectedModel,
        batchStoryboardReferenceImageCount > 0,
      ),
    [batchStoryboardReferenceImageCount, batchStoryboardSelectedModel],
  );
  const batchStoryboardEndpointMethod =
    batchStoryboardImageRoute?.methodId || "";
  const batchStoryboardEndpointModeLabel =
    batchStoryboardImageRoute?.mode === "image-to-image"
      ? "图生图"
      : batchStoryboardImageRoute?.mode === "text-to-image"
        ? "文生图"
        : "";
  const batchStoryboardAspectOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        batchStoryboardSelectedModel?.parameters?.aspectRatios,
        [],
        batchStoryboardEndpointMethod,
      ),
    [
      batchStoryboardEndpointMethod,
      batchStoryboardSelectedModel?.parameters?.aspectRatios,
    ],
  );
  const batchStoryboardSizeOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        batchStoryboardSelectedModel?.parameters?.resolutions,
        [],
        batchStoryboardEndpointMethod,
      ),
    [
      batchStoryboardEndpointMethod,
      batchStoryboardSelectedModel?.parameters?.resolutions,
    ],
  );
  const batchStoryboardCountOptions = useMemo(
    () =>
      normalizeGenerationCountOptions(
        "image",
        batchStoryboardSelectedModel?.parameters?.counts,
        batchStoryboardEndpointMethod,
      ),
    [
      batchStoryboardEndpointMethod,
      batchStoryboardSelectedModel?.parameters?.counts,
    ],
  );
  const batchStoryboardExtraParameterDefinitions = useMemo(
    () =>
      normalizeWorkflowExtraParameterDefinitions(
        batchStoryboardSelectedModel?.parameters?.extraParameters,
        batchStoryboardEndpointMethod,
      ),
    [
      batchStoryboardEndpointMethod,
      batchStoryboardSelectedModel?.parameters?.extraParameters,
    ],
  );
  const batchStoryboardQualityDefinition = useMemo(
    () =>
      getWorkflowImageQualityDefinition(
        batchStoryboardExtraParameterDefinitions,
      ),
    [batchStoryboardExtraParameterDefinitions],
  );
  const batchStoryboardQualityOptions = useMemo(
    () => getWorkflowImageQualityChoices(batchStoryboardQualityDefinition),
    [batchStoryboardQualityDefinition],
  );
  const batchStoryboardAdvancedDefinitions = useMemo(
    () =>
      getWorkflowImageNonQualityDefinitions(
        batchStoryboardExtraParameterDefinitions,
      ),
    [batchStoryboardExtraParameterDefinitions],
  );
  const resolvedBatchStoryboardExtraParameters = useMemo(
    () =>
      resolveWorkflowExtraParameterValues(
        batchStoryboardExtraParameterDefinitions,
        batchStoryboardExtraParameters,
        { fillDefaults: true },
      ),
    [batchStoryboardExtraParameterDefinitions, batchStoryboardExtraParameters],
  );
  const batchStoryboardSupportsWebSearch =
    batchStoryboardImageRoute?.config?.supportsWebSearch === true;
  const selectedBatchStoryboardWebSearch = batchStoryboardSupportsWebSearch
    ? typeof batchStoryboardWebSearch === "boolean"
      ? batchStoryboardWebSearch
      : batchStoryboardImageRoute?.config?.defaultWebSearch === true
    : false;
  const batchStoryboardModelItems = useMemo(
    () =>
      batchStoryboardModelOptions.flatMap((model) => {
        const value = getWorkflowModelOptionValue(model);
        if (!value) return [];
        return [
          {
            value,
            name: model.name || value,
            description: model.description || model.descriptionKey,
            iconUrl: isRenderableWorkflowMediaUrl(String(model.icon || ""))
              ? String(model.icon)
              : undefined,
            isPro: model.isPro === true,
            isFree: isWorkflowModelFree(model),
          },
        ];
      }),
    [batchStoryboardModelOptions],
  );
  const batchStoryboardSelectedModelItem =
    batchStoryboardModelItems.find(
      (model) =>
        model.value ===
        (getWorkflowModelOptionValue(batchStoryboardSelectedModel) ||
          batchStoryboardModelId),
    ) || null;
  const batchStoryboardRows = useMemo(
    () =>
      scriptRows.map((row, rowIndex) => ({
        rowIndex,
        label: `镜头${rowIndex + 1}`,
        prompt:
          String(
            row.storyboardPrompt ||
              row.visualDescription ||
              row.narrativeContent ||
              "",
          ).trim() || "暂无分镜提示词",
      })),
    [scriptRows],
  );

  useEffect(() => {
    if (!batchStoryboardSelectedModel) return;
    const nextModelId = getWorkflowModelOptionValue(
      batchStoryboardSelectedModel,
    );
    if (nextModelId && batchStoryboardModelId !== nextModelId)
      setBatchStoryboardModelId(nextModelId);
    const nextAspect =
      batchStoryboardAspectOptions.length > 0
        ? pickWorkflowRedrawDefault(
            batchStoryboardAspectRatio,
            batchStoryboardSelectedModel.parameters?.aspectRatios,
            batchStoryboardAspectOptions,
            batchStoryboardAspectOptions[0]?.value || "",
            batchStoryboardEndpointMethod,
          )
        : "";
    if (nextAspect !== batchStoryboardAspectRatio)
      setBatchStoryboardAspectRatio(nextAspect);
    const nextSize =
      batchStoryboardSizeOptions.length > 0
        ? pickWorkflowRedrawDefault(
            batchStoryboardImageSize,
            batchStoryboardSelectedModel.parameters?.resolutions,
            batchStoryboardSizeOptions,
            batchStoryboardSizeOptions[0]?.value || "",
            batchStoryboardEndpointMethod,
          )
        : "";
    if (nextSize !== batchStoryboardImageSize)
      setBatchStoryboardImageSize(nextSize);
    const nextCount =
      batchStoryboardCountOptions.length > 0
        ? Math.max(
            1,
            Number.parseInt(
              pickWorkflowRedrawDefault(
                String(batchStoryboardGenerationCount || ""),
                batchStoryboardSelectedModel.parameters?.counts,
                batchStoryboardCountOptions,
                batchStoryboardCountOptions[0]?.value || "",
                batchStoryboardEndpointMethod,
              ),
              10,
            ) || 1,
          )
        : undefined;
    if (nextCount !== batchStoryboardGenerationCount)
      setBatchStoryboardGenerationCount(nextCount);
    const nextQuality =
      batchStoryboardQualityOptions.length > 0
        ? pickWorkflowRedrawDefault(
            batchStoryboardQuality,
            undefined,
            batchStoryboardQualityOptions,
            batchStoryboardQualityOptions[0]?.value || "",
            batchStoryboardEndpointMethod,
          )
        : "";
    if (nextQuality !== batchStoryboardQuality)
      setBatchStoryboardQuality(nextQuality);
    const nextExtraParameters = {
      ...resolvedBatchStoryboardExtraParameters,
      ...(batchStoryboardQualityDefinition?.type && nextQuality
        ? { [batchStoryboardQualityDefinition.type]: nextQuality }
        : {}),
    };
    if (
      JSON.stringify(nextExtraParameters) !==
      JSON.stringify(batchStoryboardExtraParameters || {})
    ) {
      setBatchStoryboardExtraParameters(
        Object.keys(nextExtraParameters).length > 0
          ? nextExtraParameters
          : undefined,
      );
    }
    if (
      batchStoryboardSupportsWebSearch &&
      selectedBatchStoryboardWebSearch !== batchStoryboardWebSearch
    ) {
      setBatchStoryboardWebSearch(selectedBatchStoryboardWebSearch);
    }
    if (
      !batchStoryboardSupportsWebSearch &&
      typeof batchStoryboardWebSearch === "boolean"
    ) {
      setBatchStoryboardWebSearch(undefined);
    }
  }, [
    batchStoryboardAspectOptions,
    batchStoryboardAspectRatio,
    batchStoryboardCountOptions,
    batchStoryboardEndpointMethod,
    batchStoryboardExtraParameters,
    batchStoryboardGenerationCount,
    batchStoryboardImageSize,
    batchStoryboardModelId,
    batchStoryboardQuality,
    batchStoryboardQualityDefinition,
    batchStoryboardQualityOptions,
    batchStoryboardSelectedModel,
    batchStoryboardSizeOptions,
    batchStoryboardSupportsWebSearch,
    batchStoryboardWebSearch,
    resolvedBatchStoryboardExtraParameters,
    selectedBatchStoryboardWebSearch,
  ]);

  const applyPrompt = useCallback(
    (value: string) => {
      onUpdateNode?.(node.id, { prompt: value });
    },
    [node.id, onUpdateNode],
  );

  const ensureScriptResult = useCallback(() => {
    const nextTitle = getWorkflowScriptNodeTitle(
      title || node.data?.title || "脚本生成器",
    );
    const nextResult = scriptResult || createWorkflowScriptV2Result(nextTitle);
    onUpdateNode?.(node.id, {
      title: nextTitle,
      componentType: "script-v2-generator",
      selectedOptionId: "custom",
      scriptResult: nextResult,
      scriptViewMode: "script",
      workflowGenerationRunning: false,
      workflowGenerationProgress: undefined,
      workflowGenerationError: "",
      suppressGenerationBar: false,
    });
    return nextResult;
  }, [node.data?.title, node.id, onUpdateNode, scriptResult, title]);

  const openCustomEditor = useCallback(() => {
    ensureScriptResult();
    window.requestAnimationFrame(() => setScriptFullscreenOpen(true));
  }, [ensureScriptResult]);

  const updateScriptRow = useCallback(
    (rowIndex: number, key: LibTvStoryboardScriptColumnKey, value: string) => {
      const currentResult = scriptResult || createWorkflowScriptV2Result(title);
      const rows = Array.isArray(currentResult.rows) ? currentResult.rows : [];
      const nextRows = rows.map((row, index) =>
        index === rowIndex ? { ...row, [key]: value } : row,
      );
      onUpdateNode?.(node.id, {
        scriptResult: { ...currentResult, rows: nextRows },
      });
    },
    [node.id, onUpdateNode, scriptResult, title],
  );

  const addScriptRow = useCallback(() => {
    const currentResult = scriptResult || createWorkflowScriptV2Result(title);
    const rows = Array.isArray(currentResult.rows) ? currentResult.rows : [];
    const nextRow = createEmptyStoryboardScriptRow(rows.length);
    nextRow.duration = "5s";
    onUpdateNode?.(node.id, {
      scriptResult: { ...currentResult, rows: [...rows, nextRow] },
    });
  }, [node.id, onUpdateNode, scriptResult, title]);

  const updateScriptRows = useCallback(
    (rows: LibTvStoryboardScriptRow[]) => {
      const currentResult = scriptResult || createWorkflowScriptV2Result(title);
      onUpdateNode?.(node.id, { scriptResult: { ...currentResult, rows } });
    },
    [node.id, onUpdateNode, scriptResult, title],
  );

  const deleteScriptRow = useCallback(
    (rowIndex: number) => {
      const currentResult = scriptResult || createWorkflowScriptV2Result(title);
      const rows = Array.isArray(currentResult.rows) ? currentResult.rows : [];
      if (rows.length <= 1) {
        message.warning("至少保留一个镜头");
        return;
      }
      const nextRows = rows
        .filter((_row, index) => index !== rowIndex)
        .map((row, index) => ({ ...row, shotNumber: String(index + 1) }));
      onUpdateNode?.(node.id, {
        scriptResult: { ...currentResult, rows: nextRows },
      });
    },
    [node.id, onUpdateNode, scriptResult, title],
  );

  const persistScriptV2WorkspaceState = useCallback(
    (step: ScriptV2WorkspaceStep, assetsByKind: Record<string, unknown[]>) => {
      onUpdateNode?.(node.id, {
        scriptV2ActiveStep: step,
        scriptV2AssetsByKind: assetsByKind,
      } as any);
    },
    [node.id, onUpdateNode],
  );

  const persistScriptV2Assets = useCallback(
    (assetsByKind: Record<string, unknown[]>) => {
      onUpdateNode?.(node.id, { scriptV2AssetsByKind: assetsByKind } as any);
    },
    [node.id, onUpdateNode],
  );

  const handleScriptV2PrepareAssets = useCallback(() => {
    if (!onGenerateNode) return;
    setLocalPreparingAssets(true);
    onUpdateNode?.(node.id, {
      note: "正在提取资产信息",
      workflowGenerationRunning: true,
      workflowGenerationProgress: 0.03,
      workflowGenerationError: "",
      suppressGenerationBar: true,
    } as any);
    onGenerateNode?.(node.id, prompt, { scriptV2Stage: "prepare-assets" });
  }, [node.id, onGenerateNode, onUpdateNode, prompt]);

  const handleScriptV2ComposeComplete = useCallback(
    (
      rows: LibTvStoryboardScriptRow[],
      assetsByKind: Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>,
    ) => {
      const currentResult = scriptResult || createWorkflowScriptV2Result(title);
      onUpdateNode?.(node.id, {
        scriptResult: { ...currentResult, rows },
        scriptV2ActiveStep: "compose-prompts",
        scriptV2AssetsByKind: assetsByKind,
        suppressGenerationBar: true,
      } as any);
      onImportScriptV2Assets?.(node.id, {
        title: getWorkflowScriptNodeTitle(
          title || node.data?.title || "脚本生成器",
        ),
        rows,
        assetsByKind,
      });
    },
    [
      node.data?.title,
      node.id,
      onImportScriptV2Assets,
      onUpdateNode,
      scriptResult,
      title,
    ],
  );

  const submitBatchStoryboard = useCallback(
    (selectedRows: number[]) => {
      const rowIndexes = Array.from(new Set(selectedRows))
        .filter((index) => index >= 0 && index < scriptRows.length)
        .sort((a, b) => a - b);
      if (rowIndexes.length === 0) {
        message.warning("请至少勾选一个镜头");
        return;
      }
      if (!batchStoryboardModelId) {
        message.warning("请先选择图片模型");
        return;
      }
      const workflowExtraParameters = {
        ...resolvedBatchStoryboardExtraParameters,
        ...(batchStoryboardQualityDefinition?.type && batchStoryboardQuality
          ? {
              [batchStoryboardQualityDefinition.type]: batchStoryboardQuality,
            }
          : {}),
      };
      const generationCount =
        batchStoryboardCountOptions.length > 0
          ? Math.max(1, Number(batchStoryboardGenerationCount || 1))
          : undefined;
      onUpdateNode?.(node.id, {
        suppressGenerationBar: true,
        storyboardImageModelId: batchStoryboardModelId,
        storyboardImageEndpointMethod:
          batchStoryboardEndpointMethod || undefined,
        storyboardImageAspectRatio: batchStoryboardAspectRatio || undefined,
        storyboardImageSize: batchStoryboardImageSize || undefined,
        storyboardImageQuality: batchStoryboardQuality || undefined,
        storyboardImageGenerationCount: generationCount,
        storyboardImageWebSearch: batchStoryboardSupportsWebSearch
          ? selectedBatchStoryboardWebSearch
          : undefined,
        storyboardImageExtraParameters:
          Object.keys(workflowExtraParameters).length > 0
            ? workflowExtraParameters
            : undefined,
      } as any);
      onGenerateStoryboard?.(node.id, {
        rowIndexes,
        prompt: "",
        modelId: batchStoryboardModelId,
        workflowEndpointMethod: batchStoryboardEndpointMethod || undefined,
        imageSize: batchStoryboardImageSize || undefined,
        aspectRatio: batchStoryboardAspectRatio || undefined,
        quality: batchStoryboardQuality || undefined,
        generationCount,
        workflowExtraParameters:
          Object.keys(workflowExtraParameters).length > 0
            ? workflowExtraParameters
            : undefined,
        enableWebSearch: batchStoryboardSupportsWebSearch
          ? selectedBatchStoryboardWebSearch
          : undefined,
        deferGeneration: true,
      });
      setBatchStoryboardOpen(false);
    },
    [
      batchStoryboardAspectRatio,
      batchStoryboardCountOptions.length,
      batchStoryboardEndpointMethod,
      batchStoryboardGenerationCount,
      batchStoryboardImageSize,
      batchStoryboardModelId,
      batchStoryboardQuality,
      batchStoryboardQualityDefinition,
      batchStoryboardSupportsWebSearch,
      node.id,
      onGenerateStoryboard,
      onUpdateNode,
      resolvedBatchStoryboardExtraParameters,
      selectedBatchStoryboardWebSearch,
      scriptRows.length,
    ],
  );

  const renderScriptV2StageCompact = () => {
    const stages = [
      { key: "shots", label: "确认镜头", done: hasScriptRows },
      { key: "assets", label: "准备资产", done: scriptV2AssetCount > 0 },
      { key: "prompts", label: "合成提示词", done: hasPromptRows },
    ];
    return (
      <div
        data-testid="scriptv2-stage-progress-compact"
        className="flex h-full flex-col items-center justify-between px-8 pb-8 pt-[68px] text-fg-default"
      >
        <div className="flex w-full flex-col items-center gap-4">
          <div
            data-testid="scriptv2-stage-progress-icon"
            className="flex h-[66px] w-[66px] items-center justify-center"
          >
            <div
              aria-hidden="true"
              className="flex h-[66px] w-[66px] flex-col items-center justify-center gap-1.5 text-fg-disabled"
            >
              <div className="h-1 w-9 rounded-full bg-current" />
              <div className="h-1 w-9 rounded-full bg-current" />
              <div className="h-1 w-9 rounded-full bg-current" />
              <div className="h-1 w-6 rounded-full bg-current" />
            </div>
          </div>
          <div
            data-testid="scriptv2-stage-progress-track"
            className="relative h-[62px] w-full max-w-[286px]"
          >
            <div
              data-complete={stageActiveIndex > 0}
              data-testid="scriptv2-stage-connector-shots"
              className={`absolute top-[19px] h-0.5 rounded-full ${stageActiveIndex > 0 ? "bg-white/90" : "bg-white/18"}`}
              style={{ left: 67.8333, width: 55 }}
            />
            <div
              data-complete={stageActiveIndex > 1}
              data-testid="scriptv2-stage-connector-assets"
              className={`absolute top-[19px] h-0.5 rounded-full ${stageActiveIndex > 1 ? "bg-white/90" : "bg-white/18"}`}
              style={{ left: 163.167, width: 55 }}
            />
            <div className="grid h-full grid-cols-3">
              {stages.map((stage, index) => {
                const active = index === stageActiveIndex;
                const ready = stage.done;
                return (
                  <div
                    key={stage.key}
                    className="flex min-w-0 flex-col items-center"
                  >
                    <div
                      data-testid={`scriptv2-stage-pill-${stage.key}`}
                      data-status={ready ? "ready" : active ? "active" : "idle"}
                      className="flex min-w-0 flex-col items-center pt-2"
                    >
                      <div
                        data-testid={`scriptv2-stage-circle-${stage.key}`}
                        className={`relative z-[1] flex h-6 w-6 items-center justify-center rounded-full text-[14px] font-semibold leading-none ${ready || active ? "bg-[var(--btn-invert-bg)] text-[var(--btn-invert-text)]" : "border border-border-emphasis bg-transparent text-fg-subtle"}`}
                      >
                        {ready ? <ScriptV2StageReadyIcon /> : index + 1}
                      </div>
                      <div
                        className={`mt-1 text-center text-[13px] font-normal leading-[18px] ${ready || active ? "text-fg-default" : "text-fg-muted"}`}
                      >
                        {stage.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="nodrag nopan flex h-10 w-full max-w-[286px] cursor-pointer items-center justify-center rounded-lg bg-canvas-controls-hover text-sm font-semibold text-fg-default transition-colors hover:bg-canvas-controls-active"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={(event) => {
            event.stopPropagation();
            openCustomEditor();
          }}
        >
          打开脚本生成器 →
        </button>
      </div>
    );
  };

  return (
    <div className="relative overflow-visible" style={{ width: "fit-content" }}>
      {showFloatingControls &&
      showNodeChrome &&
      !scriptFullscreenOpen &&
      !generationRunning ? (
        <div
          className="node-floating-ui nodrag nowheel nopan pointer-events-auto absolute left-1/2 z-20 flex origin-bottom -translate-x-1/2 items-center justify-center transition-[transform,opacity] duration-150 ease-out"
          data-floating-ui-shell="true"
          style={{ bottom: "calc(100% + 32px)" }}
        >
          <div className="flex w-max items-center">
            <div
              className="flex items-center justify-center gap-1"
              style={{
                padding: 4,
                borderRadius: 12,
                border: "0.5px solid var(--canvas-controls-border, #363636)",
                background: "var(--canvas-controls-bg, #262626)",
                boxShadow:
                  "var(--canvas-shadow-dropdown, rgba(0, 0, 0, 0.12) 0px 4px 10px 0px, rgba(0, 0, 0, 0.2) 0px 2px 4px 0px)",
                backdropFilter: "blur(16px)",
                color: "var(--canvas-controls-text, #fff)",
              }}
            >
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg px-3 py-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateNode?.(node.id, { suppressGenerationBar: true });
                  onGenerateNode?.(node.id, prompt);
                }}
              >
                <ScriptV2ToolbarRefreshIcon />
                <span className="whitespace-nowrap">重新生成</span>
              </button>
              <button
                type="button"
                disabled={!canBatchStoryboard}
                className="flex h-8 items-center justify-center gap-1 rounded-lg px-3 py-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-30"
                title={canBatchStoryboard ? "批量生成分镜" : "请先生成脚本"}
                onClick={(event) => {
                  event.stopPropagation();
                  setBatchStoryboardOpen(true);
                }}
              >
                <ScriptV2ToolbarStoryboardIcon />
                <span className="whitespace-nowrap">批量生成分镜</span>
              </button>
              <button
                type="button"
                disabled={!canBatchVideo}
                className="flex h-8 items-center justify-center gap-1 rounded-lg px-3 py-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-30"
                title={canBatchVideo ? "批量生视频" : "请先合成提示词"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (
                    !linkedStoryboardVideoGroup ||
                    linkedStoryboardVideoGroup.items.length === 0
                  ) {
                    message.warning("请先创建分镜图组");
                    return;
                  }
                  setBatchVideoOpen(true);
                }}
              >
                <ScriptV2ToolbarVideoIcon />
                <span className="whitespace-nowrap">批量生视频</span>
              </button>
              <div
                className="mx-1 h-5"
                style={{
                  width: 0,
                  borderLeft:
                    "0.5px solid var(--canvas-controls-border, #363636)",
                }}
              />
              <button
                type="button"
                disabled={!scriptResult}
                title="下载"
                className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-30"
                onClick={(event) => {
                  event.stopPropagation();
                  if (scriptResult) downloadWorkflowScriptResult(scriptResult);
                }}
              >
                <ScriptV2ToolbarDownloadIcon />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className="node-shell relative"
        data-nodeid={node.id}
        data-testid={`canvas-node-script-v2-${node.id}`}
        style={{ overflow: "visible", width: "fit-content" }}
      >
        <div
          className={`node-floating-ui origin-bottom-left ${WORKFLOW_NODE_TITLE_BAR_CLASS}`}
          style={WORKFLOW_NODE_TITLE_BAR_STYLE}
        >
          <span className="flex shrink-0 items-center text-fg-muted">
            <TapNowNodeIcon kind="script-v2" size={14} opacity={0.82} />
          </span>
          <div
            className="relative min-w-0 max-w-full shrink"
            style={{
              width: getWorkflowNodeTitleWidth(
                getWorkflowScriptNodeTitle(title),
              ),
            }}
          >
            <span
              className="pointer-events-none invisible inline-block select-none whitespace-pre align-top text-[13px]"
              aria-hidden="true"
            >
              {getWorkflowScriptNodeTitle(title)}
            </span>
            <input
              placeholder="请输入标题"
              className="nodrag nopan nowheel absolute inset-0 box-border h-auto w-full cursor-text truncate border-none bg-transparent p-0 text-[13px] text-inherit outline-none"
              data-testid="canvas-node-title"
              value={title}
              title={getWorkflowScriptNodeTitle(title)}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() =>
                onUpdateNode?.(node.id, {
                  title: getWorkflowScriptNodeTitle(title),
                })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>

        <div
          className="group flex flex-col overflow-visible rounded-xl"
          data-node-focus-surface="true"
          style={{
            width: LIBTV_TAPNOW_SCRIPT_WIDTH,
            height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
            background: "var(--Fill-Panel-background, #212121)",
            border:
              "1px solid var(--canvas-node-border, rgba(255,255,255,0.16))",
            outline:
              selected && showNodeChrome
                ? ZMTV_NODE_SURFACE_SELECTED_OUTLINE
                : "0 solid transparent",
            outlineOffset: -1,
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
            <div
              data-testid="scriptv2-resource-card-surface"
              className="relative min-h-0 flex-1 cursor-grab active:cursor-grabbing"
            >
              {generationRunning ? (
                <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                  <Loader2 className="mb-4 size-8 animate-spin text-fg-muted" />
                  <div className="text-sm font-medium text-fg-default">
                    生成中
                  </div>
                  <div className="mt-2 max-w-[250px] text-xs leading-5 text-fg-subtle">
                    {String(node.data?.note || "正在生成脚本表格...")}
                  </div>
                </div>
              ) : (
                renderScriptV2StageCompact()
              )}
            </div>
          </div>
        </div>
      </div>

      {showFloatingControls &&
      showNodeChrome &&
      !scriptFullscreenOpen &&
      !generationRunning &&
      !node.data?.suppressGenerationBar ? (
        <NodeGenerationBar
          kind="script"
          modelId={node.data?.modelId}
          selectedOptionId={node.data?.selectedOptionId}
          promptInputDisabled={node.data?.workflowPromptDisabled}
          promptPlaceholderText={node.data?.workflowPromptPlaceholder}
          prompt={prompt}
          onPromptChange={applyPrompt}
          onModelChange={(value) => onUpdateNode?.(node.id, { modelId: value })}
          workflowExtraParameters={node.data?.workflowExtraParameters}
          onGenerationSettingsChange={(patch) => onUpdateNode?.(node.id, patch)}
          onGenerate={(promptDraft, settings) => {
            onUpdateNode?.(node.id, {
              prompt: typeof promptDraft === "string" ? promptDraft : prompt,
              ...settings,
              suppressGenerationBar: true,
            });
            onGenerateNode?.(node.id, promptDraft, settings);
          }}
          projectId={projectId}
          upstreamNodes={upstreamNodes}
        />
      ) : null}

      {linkedStoryboardVideoGroup ? (
        <BatchStoryboardVideoModal
          open={batchVideoOpen}
          title={linkedStoryboardVideoGroup.title}
          items={linkedStoryboardVideoGroup.items}
          modelId={batchVideoModelId}
          aspectRatio={batchVideoAspectRatio}
          videoResolution={batchVideoResolution}
          videoDuration={batchVideoDuration}
          videoMethod={batchVideoMethod}
          generationCount={batchVideoGenerationCount}
          generateAudio={batchVideoGenerateAudio}
          enableWebSearch={batchVideoWebSearch}
          workflowExtraParameters={batchVideoExtraParameters}
          onModelChange={(value) => {
            setBatchVideoModelId(value);
            onUpdateNode?.(node.id, { storyboardVideoModelId: value } as any);
          }}
          onAspectRatioChange={(value) => {
            setBatchVideoAspectRatio(value);
            onUpdateNode?.(node.id, {
              storyboardVideoAspectRatio: value,
            } as any);
          }}
          onVideoResolutionChange={(value) => {
            setBatchVideoResolution(value);
            onUpdateNode?.(node.id, {
              storyboardVideoResolution: value,
            } as any);
          }}
          onVideoDurationChange={(value) => {
            setBatchVideoDuration(value);
            onUpdateNode?.(node.id, {
              storyboardVideoDuration: value,
            } as any);
          }}
          onVideoMethodChange={(value) => {
            setBatchVideoMethod(value);
            onUpdateNode?.(node.id, {
              storyboardVideoMethod: value,
            } as any);
          }}
          onGenerationCountChange={(value) => {
            setBatchVideoGenerationCount(value);
            onUpdateNode?.(node.id, {
              storyboardVideoGenerationCount: value,
            } as any);
          }}
          onGenerateAudioChange={(value) => {
            setBatchVideoGenerateAudio(value);
            onUpdateNode?.(node.id, {
              storyboardVideoGenerateAudio: value,
            } as any);
          }}
          onEnableWebSearchChange={(value) => {
            setBatchVideoWebSearch(value);
            onUpdateNode?.(node.id, {
              storyboardVideoWebSearch: value,
            } as any);
          }}
          onWorkflowExtraParametersChange={(value) => {
            setBatchVideoExtraParameters(value);
            onUpdateNode?.(node.id, {
              storyboardVideoExtraParameters: value,
            } as any);
          }}
          onClose={() => setBatchVideoOpen(false)}
          onConfirm={(request) => {
            const rowDurations = request.rowDurations;
            const firstDuration =
              request.videoDuration ||
              request.rowIndexes
                .map((rowIndex) => rowDurations[rowIndex])
                .find(Boolean) ||
              linkedStoryboardVideoGroup.videoDuration ||
              "";
            const maxClipDurationSeconds = Math.max(
              1,
              Number(String(firstDuration).replace(/[^\d.]/g, "")) ||
                Math.max(
                  0,
                  ...Object.values(rowDurations).map(
                    (value) =>
                      Number(String(value).replace(/[^\d.]/g, "")) || 0,
                  ),
                ),
            );
            setBatchVideoModelId(request.modelId);
            setBatchVideoAspectRatio(request.aspectRatio || "");
            setBatchVideoResolution(request.videoResolution || "");
            setBatchVideoDuration(firstDuration);
            setBatchVideoMethod(request.videoMethod || "");
            setBatchVideoGenerationCount(request.generationCount);
            setBatchVideoGenerateAudio(request.generateAudio);
            setBatchVideoWebSearch(request.enableWebSearch);
            setBatchVideoExtraParameters(request.workflowExtraParameters);
            onUpdateNode?.(node.id, {
              storyboardVideoModelId: request.modelId,
              storyboardVideoAspectRatio: request.aspectRatio,
              storyboardVideoResolution: request.videoResolution,
              storyboardVideoDuration: firstDuration,
              storyboardVideoMethod: request.videoMethod,
              storyboardVideoGenerationCount: request.generationCount,
              storyboardVideoGenerateAudio: request.generateAudio,
              storyboardVideoWebSearch: request.enableWebSearch,
              storyboardVideoExtraParameters: request.workflowExtraParameters,
            } as any);
            setBatchVideoOpen(false);
            onGenerateStoryboardVideos?.(linkedStoryboardVideoGroup.id, {
              modelId: request.modelId,
              aspectRatio: request.aspectRatio,
              videoResolution: request.videoResolution,
              videoDuration: firstDuration,
              videoMethod: request.videoMethod,
              generationCount: request.generationCount,
              generateAudio: request.generateAudio,
              enableWebSearch: request.enableWebSearch,
              workflowExtraParameters: request.workflowExtraParameters,
              rowIndexes: request.rowIndexes,
              rowDurations,
              deferGeneration: true,
              maxClipDurationSeconds,
              plannedClipCount: request.rowIndexes.length,
            });
          }}
        />
      ) : null}

      <BatchStoryboardImageModal
        open={batchStoryboardOpen}
        nodeId={node.id}
        rows={batchStoryboardRows}
        models={batchStoryboardModelItems}
        modelsLoading={batchStoryboardModelsLoading}
        selectedModel={batchStoryboardSelectedModelItem}
        selectedModelValue={
          getWorkflowModelOptionValue(batchStoryboardSelectedModel) ||
          batchStoryboardModelId
        }
        endpointModeLabel={batchStoryboardEndpointModeLabel}
        aspectOptions={batchStoryboardAspectOptions}
        sizeOptions={batchStoryboardSizeOptions}
        qualityOptions={batchStoryboardQualityOptions}
        countOptions={batchStoryboardCountOptions}
        selectedAspect={batchStoryboardAspectRatio}
        selectedSize={batchStoryboardImageSize}
        selectedQuality={batchStoryboardQuality}
        selectedCount={String(batchStoryboardGenerationCount || "")}
        supportsWebSearch={batchStoryboardSupportsWebSearch}
        webSearchEnabled={selectedBatchStoryboardWebSearch}
        extraParameterDefinitions={batchStoryboardAdvancedDefinitions}
        extraParameters={batchStoryboardExtraParameters}
        managedValues={getWorkflowManagedExtraParameterValues(
          batchStoryboardSelectedModel,
        )}
        referenceImageCount={batchStoryboardReferenceImageCount}
        onModelChange={setBatchStoryboardModelId}
        onAspectChange={setBatchStoryboardAspectRatio}
        onSizeChange={setBatchStoryboardImageSize}
        onQualityChange={(value) => {
          setBatchStoryboardQuality(value);
          const qualityType = batchStoryboardQualityDefinition?.type;
          if (!qualityType) return;
          setBatchStoryboardExtraParameters((current) => ({
            ...(current || {}),
            [qualityType]: value,
          }));
        }}
        onCountChange={(value) =>
          setBatchStoryboardGenerationCount(
            Math.max(1, Number.parseInt(value, 10) || 1),
          )
        }
        onWebSearchChange={setBatchStoryboardWebSearch}
        onExtraParametersChange={setBatchStoryboardExtraParameters}
        onClose={() => setBatchStoryboardOpen(false)}
        onConfirm={submitBatchStoryboard}
      />

      {scriptFullscreenOpen ? (
        <ScriptV2Workspace
          title={title}
          shotCount={(scriptResult?.rows || []).length || 1}
          projectId={projectId}
          canvasImageAssets={canvasImageAssets}
          scriptResult={scriptResult || createWorkflowScriptV2Result(title)}
          initialStep={
            scriptV2ActiveStep === "prepare-assets" ||
            scriptV2ActiveStep === "compose-prompts"
              ? scriptV2ActiveStep
              : "confirm-shots"
          }
          table={
            <WorkflowScriptTable
              result={scriptResult || createWorkflowScriptV2Result(title)}
              onRowChange={updateScriptRow}
              visibleColumnKeys={SCRIPT_V2_VISIBLE_COLUMN_KEYS}
              scriptV2AssetsByKind={scriptV2AssetsByKind}
            />
          }
          onRowChange={updateScriptRow}
          onRowsChange={updateScriptRows}
          onDeleteRow={deleteScriptRow}
          onAddRow={addScriptRow}
          onClose={() => setScriptFullscreenOpen(false)}
          initialAssetsByKind={(scriptV2AssetsByKind as any) || undefined}
          onStepChange={persistScriptV2WorkspaceState as any}
          onAssetsChange={persistScriptV2Assets as any}
          onPrepareAssets={handleScriptV2PrepareAssets}
          preparingAssets={preparingAssets}
          onComposePromptsComplete={handleScriptV2ComposeComplete}
          onComposeAll={() => message.success("已合成全部提示词")}
        />
      ) : null}
    </div>
  );
}

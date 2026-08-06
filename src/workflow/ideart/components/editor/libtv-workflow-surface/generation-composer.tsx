"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  Mic,
  Plus,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { useApimartVoiceInput } from "@/workflow/ideart/lib/hooks/use-apimart-voice-input";
import {
  WorkflowExtraParametersPanel,
  getWorkflowExtraParameterDefaults,
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
  type WorkflowExtraParameterValue,
} from "./workflow-extra-parameters";
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { isSeedanceVideoModelId } from "@/workflow/ideart/lib/video/seedance-request";
import { message } from "@/workflow/ideart/shims/antd";
import {
  LIBTV_SCRIPT_GENERATOR_PROMPT_PLACEHOLDER,
  LIBTV_TEXT_GENERATOR_PROMPT_PLACEHOLDER,
  WORKFLOW_IMAGE_PRESET_GROUPS,
  WORKFLOW_IMAGE_SLASH_PRESET_OPTIONS,
  WorkflowMediaMentionPreview,
  collectWorkflowScriptReferenceMedia,
  getWorkflowMentionKindLabel,
  insertWorkflowMentionAtCursor,
  removeWorkflowSlashCommand,
  resolveWorkflowGptImage2ModelValue,
  resolveWorkflowMentionTrigger,
  resolveWorkflowSlashMenuPosition,
} from "./workflow-connections";
import {
  SEEDANCE_AVATAR_POPUP_SELECTOR,
  fetchWorkflowModelOptions,
  findWorkflowModelOptionByIdentity,
  getWorkflowManagedExtraParameterValues,
  getWorkflowModelOptionValue,
  getWorkflowSurfaceSeedanceAssetUrl,
  getWorkflowVideoMethodDefinitions,
  normalizeWorkflowModelIdentity,
  resolveWorkflowImageExecutionRoute,
  workflowModelOptionsCache,
  workflowModelOptionsListeners,
} from "./workflow-models";
import {
  convertWorkflowImageUrlToFile,
  getWorkflowImageRenderUrl,
  getWorkflowVideoPosterUrl,
  isRenderableWorkflowMediaUrl,
} from "./workflow-media-utils";
import {
  getWorkflowImageNonQualityDefinitions,
  getWorkflowImageQualityChoices,
  getWorkflowImageQualityDefinition,
  getWorkflowVideoMethodAvailability,
  getWorkflowVideoMethodRouteMode,
  normalizeGenerationCountOptions,
  normalizeWorkflowRedrawChoicesForMethod,
  normalizeWorkflowVideoMethodChoices,
  normalizeWorkflowVideoMethodValue,
  pickWorkflowRedrawDefault,
  resolveWorkflowVideoMethod,
  resolveWorkflowVideoReferenceUiMode,
  workflowChoiceValueExists,
} from "./generation-options";
import {
  AspectRatioGlyph,
  CameraControlPopup,
  GenerationPopupList,
  ImageSizePopup,
  ModelPopupList,
  PortraitTextureSettingsPopup,
  VideoCameraMotionPopup,
  VideoCharacterAssetLibraryPopup,
  VideoModePopup,
  VideoSettingsPopup,
  WorkflowImagePresetMentionBadge,
  WorkflowImagePresetShortcutPopup,
  WorkflowModelBadges,
  WorkflowModelIcon,
  WorkflowStyleGalleryPopup,
  WorkflowVideoMethodIcon,
  getWorkflowVideoCharacterPreviewUrl,
  resolvePortraitTextureSettings,
} from "./generation-popovers";
import {
  CANVAS_CONTROLS_MENU_PANEL_STYLE,
  WORKFLOW_NODE_CLOSE_MENUS_EVENT,
} from "./surface-contracts";
import {
  BananaModelIcon,
  ExpandCornersIcon,
  FocusModeIcon,
  ImageGeneratorCameraButtonIcon,
  ImageGeneratorSettingButtonIcon,
  MicrophoneIcon,
  PresetToggleIcon,
  SparkleModelIcon,
  StyleReferenceIcon,
  WorkflowPromptOptimizeDialogCloseIcon,
  WorkflowPromptOptimizeDialogCopyIcon,
  WorkflowPromptOptimizeDialogRefreshIcon,
  WorkflowVideoAdvancedButtonIcon,
  WorkflowVideoCharacterButtonIcon,
  WorkflowVideoEffectsButtonIcon,
  WorkflowVideoMotionButtonIcon,
  WorkflowVideoPromptOptimizeButtonIcon,
  WorkflowVideoTranslateButtonIcon,
} from "./workflow-icons";
import type {
  WorkflowImagePresetOption,
  WorkflowImagePresetResult,
  WorkflowMediaMentionKind,
  WorkflowMediaMentionOption,
  WorkflowModelOption,
  WorkflowStyleGalleryItem,
  WorkflowUpstreamNodeSummary,
  WorkflowVideoReferenceCard,
} from "./workflow-models";
import type {
  WorkflowGenerationSubmitHandler,
  WorkflowGenerationSubmitSettings,
  WorkflowRedrawChoice,
} from "./surface-contracts";
import type { WorkflowVideoInputCounts } from "./generation-options";

export function NodeGenerationBar({
  kind,
  modelId,
  workflowEndpointMethod,
  selectedOptionId,
  aspectRatio,
  imageSize,
  stylePreset,
  videoMethod,
  videoDuration,
  videoResolution,
  generateAudio,
  enableWebSearch,
  generationCount,
  cameraControl,
  videoCameraMotion,
  videoCharacterAssets,
  workflowPortraitTextureSettings,
  workflowExtraParameters,
  promptInputDisabled = false,
  promptPlaceholderText,
  prompt,
  onPromptChange,
  onModelChange,
  onGenerationSettingsChange,
  onRequestGenerationFrame,
  onGenerate,
  onCancel,
  projectId,
  selectedItemCount,
  totalItemCount,
  referenceImages = [],
  referenceImageNodeIds = [],
  referenceImageRoles = [],
  upstreamNodes = [],
  onReferenceFilesUploaded,
  onReferenceRemoved,
  onStartFocusPick,
  embedded = false,
}: {
  kind: LibTvWorkflowNode["kind"];
  modelId?: string;
  workflowEndpointMethod?: string;
  selectedOptionId?: string;
  aspectRatio?: string;
  imageSize?: string;
  stylePreset?: string;
  videoMethod?: string;
  videoDuration?: string;
  videoResolution?: string;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  generationCount?: number;
  cameraControl?: LibTvWorkflowNode["data"]["cameraControl"];
  videoCameraMotion?: LibTvWorkflowNode["data"]["videoCameraMotion"];
  videoCharacterAssets?: LibTvWorkflowNode["data"]["videoCharacterAssets"];
  workflowPortraitTextureSettings?: LibTvWorkflowNode["data"]["workflowPortraitTextureSettings"];
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  promptInputDisabled?: boolean;
  promptPlaceholderText?: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  onModelChange?: (value: string) => void;
  onGenerationSettingsChange?: (
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onGeneratedResult?: (result: WorkflowImagePresetResult) => void;
  onRequestGenerationFrame?: (aspectRatio: string) => void;
  onGenerate?: WorkflowGenerationSubmitHandler;
  onCancel?: () => void;
  projectId?: string;
  selectedItemCount?: number;
  totalItemCount?: number;
  referenceImages?: string[];
  referenceImageNodeIds?: string[];
  referenceImageRoles?: string[];
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  onReferenceFilesUploaded?: (files: File[]) => void;
  onReferenceRemoved?: (index: number, sourceId: string) => void;
  onStartFocusPick?: () => void;
  /** Layout-only switch for projected views such as the storyboard. */
  embedded?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const activePopupRef = useRef<HTMLDivElement | null>(null);
  const activePopupAnchorRef = useRef<HTMLButtonElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [activePopup, setActivePopup] = useState<
    | "model"
    | "mode"
    | "ratio"
    | "style"
    | "presets"
    | "portraitTexture"
    | "camera"
    | "count"
    | "motion"
    | "characters"
    | null
  >(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const presetOptions = WORKFLOW_IMAGE_SLASH_PRESET_OPTIONS;
  const [inputExpanded, setInputExpanded] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashMenuPosition, setSlashMenuPosition] =
    useState<ReturnType<typeof resolveWorkflowSlashMenuPosition>>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [generationSubmitting, setGenerationSubmitting] = useState(false);
  const generationSubmittingRef = useRef(false);
  const [promptOptimizing, setPromptOptimizing] = useState(false);
  const [promptOptimizedResult, setPromptOptimizedResult] = useState("");
  const [promptOptimizeDialogOpen, setPromptOptimizeDialogOpen] =
    useState(false);
  const [promptOptimizeCopied, setPromptOptimizeCopied] = useState(false);
  const [
    promptOptimizeSuccessNoticeVisible,
    setPromptOptimizeSuccessNoticeVisible,
  ] = useState(false);
  const [promptTranslating, setPromptTranslating] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("");
  const promptCommitTimeoutRef = useRef<number | null>(null);
  const promptOptimizeCopiedTimeoutRef = useRef<number | null>(null);
  const promptOptimizeSuccessNoticeTimeoutRef = useRef<number | null>(null);
  const promptRef = useRef(prompt);
  const promptDraftDirtyRef = useRef(false);
  const onModelChangeRef = useRef(onModelChange);
  const onGenerationSettingsChangeRef = useRef(onGenerationSettingsChange);
  const onRequestGenerationFrameRef = useRef(onRequestGenerationFrame);
  const lastAutoSettingsPatchRef = useRef("");
  const supportsImageReferences =
    kind === "image" || kind === "video" || kind === "script";
  const accept =
    kind === "video" || kind === "script"
      ? "image/*,video/*,audio/*"
      : "image/*";
  const isTextNode = kind === "text";
  const isImageNode = kind === "image";
  const isVideoNode = kind === "video";
  const isScriptNode = kind === "script";
  const selectedImagePresetId = isImageNode
    ? String(selectedOptionId || "").trim()
    : "";
  const selectedImagePreset = selectedImagePresetId
    ? presetOptions.find((item) => item.id === selectedImagePresetId) || null
    : null;
  const promptPlaceholder = promptInputDisabled
    ? String(promptPlaceholderText || "").trim() || "模板不支持输入提示词"
    : isImageNode
      ? selectedImagePreset
        ? "继续补充生成内容，@引用素材"
        : "描述你想要生成的画面内容，@引用素材"
      : "描述任何你想要生成的内容";
  const portraitTexturePresetSelected =
    selectedImagePresetId === "portrait_texture_adjustment";
  const panoramaPresetLocked = selectedImagePresetId === "panorama-720";
  const useCompactGenerationBar = isTextNode || isScriptNode || isImageNode;
  const modelCategory =
    kind === "image" ? "image" : kind === "video" ? "video" : "chat";
  const selectedModel = useMemo(() => {
    if (!modelOptions.length) return null;
    const requestedModelId = String(modelId || "").trim();
    if (requestedModelId)
      return (
        findWorkflowModelOptionByIdentity(modelOptions, requestedModelId) ||
        null
      );
    return modelOptions.find((model) => model.isDefault) || modelOptions[0];
  }, [modelId, modelOptions]);
  const modelLabel =
    selectedModel?.name ||
    String(modelId || "").trim() ||
    (kind === "video"
      ? "选择视频模型"
      : kind === "image"
        ? "选择图片模型"
        : "选择文本模型");
  const selectedModelValue =
    getWorkflowModelOptionValue(selectedModel) || modelId || "";
  const selectedModelIconUrl = isRenderableWorkflowMediaUrl(
    String(selectedModel?.icon || ""),
  )
    ? String(selectedModel?.icon)
    : "";
  const managedExtraParameterValues = useMemo(
    () => getWorkflowManagedExtraParameterValues(selectedModel),
    [selectedModel],
  );
  const seedancePromptOptimizeAvailable =
    isVideoNode && isSeedanceVideoModelId(selectedModelValue);
  const videoInputImages = useMemo(
    () =>
      upstreamNodes.filter(
        (node) => node.kind === "image" && node.mediaRole === "ordinary",
      ),
    [upstreamNodes],
  );
  const videoInputVideos = useMemo(
    () =>
      upstreamNodes.filter(
        (node) => node.kind === "video" && node.mediaRole === "ordinary",
      ),
    [upstreamNodes],
  );
  const videoInputAudios = useMemo(
    () =>
      upstreamNodes.filter(
        (node) => node.kind === "audio" && node.mediaRole === "ordinary",
      ),
    [upstreamNodes],
  );
  const videoScriptReferenceImages = useMemo(
    () =>
      isVideoNode || isImageNode
        ? upstreamNodes
            .filter(
              (node) =>
                (node.kind === "script" || node.kind === "script-v2") &&
                node.scriptResult?.rows?.length,
            )
            .flatMap((node) => collectWorkflowScriptReferenceMedia(node))
        : [],
    [isImageNode, isVideoNode, upstreamNodes],
  );
  const scriptInputSourceCards = useMemo(
    () =>
      isScriptNode
        ? upstreamNodes
            .filter(
              (node) =>
                (node.kind === "video" || node.kind === "audio") &&
                node.mediaRole === "ordinary",
            )
            .slice(0, 8)
        : [],
    [isScriptNode, upstreamNodes],
  );
  const videoConnectedMediaCount =
    videoInputImages.length +
    videoInputVideos.length +
    videoInputAudios.length +
    videoScriptReferenceImages.length;
  const videoInputCounts = useMemo<WorkflowVideoInputCounts>(
    () => ({
      images: videoInputImages.length,
      videos: videoInputVideos.length,
      audios: videoInputAudios.length,
      scriptImages: videoScriptReferenceImages.length,
    }),
    [
      videoInputAudios.length,
      videoInputImages.length,
      videoInputVideos.length,
      videoScriptReferenceImages.length,
    ],
  );
  const scriptHasUpstreamContext = isScriptNode && upstreamNodes.length > 0;
  const hasSelectionCount = typeof selectedItemCount === "number";
  const safeSelectedItemCount = Math.max(
    0,
    Math.round(Number(selectedItemCount || 0)),
  );
  const safeTotalItemCount = Math.max(
    safeSelectedItemCount,
    Math.round(Number(totalItemCount || 0)),
  );
  const canGenerate =
    draftPrompt.trim().length > 0 ||
    Boolean(isImageNode && selectedImagePreset) ||
    (!isVideoNode && referenceImages.length > 0) ||
    (isVideoNode && upstreamNodes.length > 0) ||
    scriptHasUpstreamContext ||
    (hasSelectionCount && safeSelectedItemCount > 0);
  const methodOptions = useMemo(
    () =>
      normalizeWorkflowVideoMethodChoices(
        getWorkflowVideoMethodDefinitions(selectedModel?.parameters),
      ),
    [selectedModel?.parameters?.methods, selectedModel?.parameters?.modes],
  );
  const selectedVideoMethod = useMemo(() => {
    const currentMethod = normalizeWorkflowVideoMethodValue(videoMethod);
    return resolveWorkflowVideoMethod(
      methodOptions,
      currentMethod,
      videoInputCounts,
    );
  }, [methodOptions, videoInputCounts, videoMethod]);
  const selectedVideoMethodOption = useMemo(
    () => methodOptions.find((method) => method.value === selectedVideoMethod),
    [methodOptions, selectedVideoMethod],
  );
  const selectedVideoRouteMode = getWorkflowVideoMethodRouteMode(
    selectedVideoMethodOption,
  );
  const selectedImageExecutionRoute = useMemo(
    () =>
      resolveWorkflowImageExecutionRoute(
        selectedModel,
        referenceImages.length > 0 ||
          upstreamNodes.some((node) => node.kind === "image"),
      ),
    [referenceImages.length, selectedModel, upstreamNodes],
  );
  const selectedImageEndpointMethod =
    selectedImageExecutionRoute?.methodId || "";
  const selectedEndpointMethod = isVideoNode
    ? selectedVideoMethod
    : isImageNode
      ? selectedImageEndpointMethod
      : "";
  const selectedExtraParameterMethod = selectedEndpointMethod;
  const selectedVideoReferenceUiMode = useMemo(
    () => resolveWorkflowVideoReferenceUiMode(selectedVideoRouteMode),
    [selectedVideoRouteMode],
  );
  const videoMethodAvailability = useMemo(
    () =>
      new Map(
        methodOptions.map((method) => [
          method.value,
          getWorkflowVideoMethodAvailability(method, videoInputCounts),
        ]),
      ),
    [methodOptions, videoInputCounts],
  );
  const extraParameterDefinitions = useMemo(
    () =>
      normalizeWorkflowExtraParameterDefinitions(
        selectedModel?.parameters?.extraParameters,
        selectedExtraParameterMethod,
      ),
    [selectedExtraParameterMethod, selectedModel?.parameters?.extraParameters],
  );
  const selectedImageQualityDefinition = useMemo(
    () =>
      isImageNode
        ? getWorkflowImageQualityDefinition(extraParameterDefinitions)
        : undefined,
    [extraParameterDefinitions, isImageNode],
  );
  const selectedVideoQualityDefinition = useMemo(
    () =>
      isVideoNode
        ? getWorkflowImageQualityDefinition(extraParameterDefinitions)
        : undefined,
    [extraParameterDefinitions, isVideoNode],
  );
  const imageQualityOptions = useMemo(
    () =>
      isImageNode
        ? getWorkflowImageQualityChoices(selectedImageQualityDefinition)
        : [],
    [isImageNode, selectedImageQualityDefinition],
  );
  const videoQualityOptions = useMemo(
    () =>
      isVideoNode
        ? getWorkflowImageQualityChoices(selectedVideoQualityDefinition)
        : [],
    [isVideoNode, selectedVideoQualityDefinition],
  );
  const visibleExtraParameterDefinitions = useMemo(
    () =>
      isImageNode || isVideoNode
        ? getWorkflowImageNonQualityDefinitions(extraParameterDefinitions)
        : extraParameterDefinitions,
    [extraParameterDefinitions, isImageNode, isVideoNode],
  );
  const hasExtraParameters = visibleExtraParameterDefinitions.length > 0;
  const resolvedWorkflowExtraParameters = useMemo(() => {
    return resolveWorkflowExtraParameterValues(
      extraParameterDefinitions,
      workflowExtraParameters,
      { fillDefaults: true },
    );
  }, [extraParameterDefinitions, workflowExtraParameters]);
  const selectedImageQuality = isImageNode
    ? String(
        (selectedImageQualityDefinition?.type
          ? resolvedWorkflowExtraParameters[selectedImageQualityDefinition.type]
          : undefined) ??
          resolvedWorkflowExtraParameters.quality ??
          resolvedWorkflowExtraParameters.image_quality ??
          "",
      ).trim()
    : "";
  const selectedVideoQuality = isVideoNode
    ? String(
        (selectedVideoQualityDefinition?.type
          ? resolvedWorkflowExtraParameters[selectedVideoQualityDefinition.type]
          : undefined) ??
          resolvedWorkflowExtraParameters.quality ??
          resolvedWorkflowExtraParameters.video_quality ??
          "",
      ).trim()
    : "";
  const extraParameterContext = useMemo(
    () => ({
      modelId: selectedModelValue,
      prompt: draftPrompt,
      referenceImageCount:
        referenceImages.length +
        upstreamNodes.filter((node) => node.kind === "image").length,
      managedValues: managedExtraParameterValues,
    }),
    [
      draftPrompt,
      managedExtraParameterValues,
      referenceImages.length,
      selectedModelValue,
      upstreamNodes,
    ],
  );
  const aspectOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.aspectRatios,
        [],
        selectedEndpointMethod,
      ),
    [selectedEndpointMethod, selectedModel?.parameters?.aspectRatios],
  );
  const sizeOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.resolutions,
        [],
        selectedEndpointMethod,
      ),
    [selectedEndpointMethod, selectedModel?.parameters?.resolutions],
  );
  const imageModelSupportsAspectRatio = isImageNode && aspectOptions.length > 0;
  const imageModelSupportsImageSize = isImageNode && sizeOptions.length > 0;
  const durationOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.durations,
        [],
        selectedEndpointMethod,
      ),
    [selectedEndpointMethod, selectedModel?.parameters?.durations],
  );
  const countOptions = useMemo(
    () =>
      normalizeGenerationCountOptions(
        kind,
        selectedModel?.parameters?.counts,
        selectedEndpointMethod,
      ),
    [kind, selectedEndpointMethod, selectedModel?.parameters?.counts],
  );
  const selectedAspectRatio = useMemo(() => {
    if (aspectOptions.length === 0) return "";
    const fallback = aspectOptions[0]?.value || "";
    const picked = pickWorkflowRedrawDefault(
      String(aspectRatio || ""),
      selectedModel?.parameters?.aspectRatios,
      aspectOptions,
      fallback,
      selectedEndpointMethod,
    );
    if (isImageNode && !imageModelSupportsAspectRatio) return "";
    return picked;
  }, [
    aspectOptions,
    aspectRatio,
    imageModelSupportsAspectRatio,
    isImageNode,
    selectedEndpointMethod,
    selectedModel?.parameters?.aspectRatios,
  ]);
  const selectedImageSize = useMemo(() => {
    if (isImageNode && !imageModelSupportsImageSize) return "";
    const rawImageSize = String(imageSize || "").trim();
    return pickWorkflowRedrawDefault(
      rawImageSize,
      selectedModel?.parameters?.resolutions,
      sizeOptions,
      sizeOptions[0]?.value || "",
      selectedImageEndpointMethod,
    );
  }, [
    imageModelSupportsImageSize,
    imageSize,
    isImageNode,
    selectedImageEndpointMethod,
    selectedModel?.parameters?.resolutions,
    sizeOptions,
  ]);
  const selectedVideoResolution = useMemo(
    () =>
      sizeOptions.length > 0
        ? pickWorkflowRedrawDefault(
            String(videoResolution || imageSize || ""),
            selectedModel?.parameters?.resolutions,
            sizeOptions,
            sizeOptions[0]?.value || "",
            selectedVideoMethod,
          )
        : "",
    [
      imageSize,
      selectedModel?.parameters?.resolutions,
      sizeOptions,
      videoResolution,
    ],
  );
  const selectedVideoDuration = useMemo(
    () =>
      durationOptions.length > 0
        ? pickWorkflowRedrawDefault(
            String(videoDuration || ""),
            selectedModel?.parameters?.durations,
            durationOptions,
            durationOptions[0]?.value || "",
            selectedVideoMethod,
          )
        : "",
    [durationOptions, selectedModel?.parameters?.durations, videoDuration],
  );
  const supportsVideoAudio = Boolean(
    isVideoNode && selectedVideoMethodOption?.config?.supportsSound === true,
  );
  const defaultVideoAudioEnabled = supportsVideoAudio
    ? selectedVideoMethodOption?.config?.defaultSound === true
    : false;
  const selectedGenerateAudio = supportsVideoAudio
    ? typeof generateAudio === "boolean"
      ? generateAudio
      : defaultVideoAudioEnabled
    : false;
  const activeEndpointConfig = isVideoNode
    ? selectedVideoMethodOption?.config
    : isImageNode
      ? selectedImageExecutionRoute?.config
      : undefined;
  const supportsWebSearch = Boolean(activeEndpointConfig?.supportsWebSearch);
  const defaultWebSearchEnabled = supportsWebSearch
    ? activeEndpointConfig?.defaultWebSearch === true
    : false;
  const selectedWebSearchEnabled = supportsWebSearch
    ? typeof enableWebSearch === "boolean"
      ? enableWebSearch
      : defaultWebSearchEnabled
    : false;
  const selectedCountValue = useMemo(
    () =>
      pickWorkflowRedrawDefault(
        String(generationCount || ""),
        selectedModel?.parameters?.counts,
        countOptions,
        countOptions[0]?.value || "",
        selectedEndpointMethod,
      ),
    [
      countOptions,
      generationCount,
      selectedEndpointMethod,
      selectedModel?.parameters?.counts,
    ],
  );
  const selectedAspectLabel =
    aspectOptions.find((item) => item.value === selectedAspectRatio)?.label ||
    selectedAspectRatio;
  const selectedSizeLabel =
    sizeOptions.find((item) => item.value === selectedImageSize)?.label ||
    selectedImageSize;
  const selectedImageQualityLabel =
    imageQualityOptions.find((item) => item.value === selectedImageQuality)
      ?.label || selectedImageQuality;
  const selectedVideoQualityLabel =
    videoQualityOptions.find((item) => item.value === selectedVideoQuality)
      ?.label || selectedVideoQuality;
  const selectedVideoResolutionLabel =
    sizeOptions.find((item) => item.value === selectedVideoResolution)?.label ||
    selectedVideoResolution;
  const selectedVideoDurationLabel =
    durationOptions.find((item) => item.value === selectedVideoDuration)
      ?.label || selectedVideoDuration;
  const selectedVideoMethodLabel =
    methodOptions.find((item) => item.value === selectedVideoMethod)?.label ||
    methodOptions[0]?.label ||
    "生成模式";
  const videoMethodUnavailable =
    isVideoNode && methodOptions.length > 0 && !selectedVideoMethod;
  const selectedVideoCharacterAssets = useMemo(
    () =>
      (Array.isArray(videoCharacterAssets) ? videoCharacterAssets : [])
        .filter((item) =>
          Boolean(
            item?.assetUrl ||
            item?.referenceImageUrl ||
            item?.previewUrl ||
            item?.id,
          ),
        )
        .slice(0, 9),
    [videoCharacterAssets],
  );
  const selectedVideoCharacterPreview = selectedVideoCharacterAssets
    .map((item) => getWorkflowVideoCharacterPreviewUrl(item))
    .find(Boolean);
  const supportsVideoCharacterLibrary =
    Boolean(activeEndpointConfig?.supportsAssetLibrary) ||
    selectedVideoCharacterAssets.length > 0;
  const showGenericReferenceControls = supportsImageReferences && !isVideoNode;
  const showReferenceControls = showGenericReferenceControls;
  const focusReferenceIndex = isImageNode
    ? referenceImageRoles.findIndex((role) => role === "focus")
    : -1;
  const focusReferenceImage =
    focusReferenceIndex >= 0
      ? String(referenceImages[focusReferenceIndex] || "").trim()
      : "";
  const visibleReferenceEntries = useMemo(
    () =>
      referenceImages
        .map((src, index) => ({
          src,
          index,
          role: referenceImageRoles[index] || "",
          sourceId: String(referenceImageNodeIds[index] || ""),
        }))
        .filter((item) => item.role !== "focus"),
    [referenceImageNodeIds, referenceImageRoles, referenceImages],
  );
  const selectedCountLabel =
    countOptions.find((item) => item.value === selectedCountValue)?.label ||
    `${selectedCountValue}${isVideoNode ? "个" : "张"}`;
  const selectedCountNumber =
    countOptions.length > 0
      ? Math.max(1, Number.parseInt(selectedCountValue, 10) || 1)
      : 1;
  const generationBarWidthClass = useCompactGenerationBar
    ? isImageNode
      ? "min-w-[660px] max-w-[660px]"
      : "min-w-[640px] max-w-[650px]"
    : isVideoNode
      ? "min-w-[660px] max-w-[660px]"
      : "min-w-[860px] max-w-[920px]";
  const compactPromptHeightClass = inputExpanded
    ? "h-[320px] max-h-[420px] min-h-[320px]"
    : isVideoNode
      ? "h-20 max-h-[100px] min-h-20"
      : isImageNode
        ? "h-20 max-h-[100px] min-h-20"
        : "h-20 max-h-[120px] min-h-20";
  const actionBarClassName = isVideoNode
    ? "flex w-full items-center justify-between gap-1 px-2 pb-2 pt-0"
    : isImageNode
      ? "flex w-full items-start gap-1 px-2 pb-2 pt-0"
      : "flex h-16 w-full items-center justify-between gap-2 p-2.5";
  const generationCardClassName = isVideoNode
    ? "relative flex w-full flex-col gap-0 overflow-hidden rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[0px_4px_10px_0px_rgba(0,0,0,0.12)]"
    : isImageNode
      ? "relative flex w-full flex-col gap-0 overflow-visible rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[var(--canvas-shadow-panel)]"
      : "relative w-full rounded-[20px] border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[var(--canvas-shadow-menu)]";
  const cameraControlEnabled = Boolean(
    cameraControl?.camera ||
    cameraControl?.lens ||
    cameraControl?.focalLength ||
    cameraControl?.aperture,
  );
  const selectedCameraControl = useMemo(
    () => ({
      camera: String(cameraControl?.camera || "Sony Venice"),
      lens: String(cameraControl?.lens || "Zeiss Ultra Prime"),
      focalLength: String(cameraControl?.focalLength || "24mm"),
      aperture: String(cameraControl?.aperture || "ƒ/4"),
    }),
    [
      cameraControl?.aperture,
      cameraControl?.camera,
      cameraControl?.focalLength,
      cameraControl?.lens,
    ],
  );
  const selectedStylePreset = String(stylePreset || "自动").trim() || "自动";
  const imageToolbarPillClass =
    "flex h-8 shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-full bg-canvas-controls-hover px-2 py-1 text-fg-muted transition-colors hover:bg-canvas-controls-active hover:text-fg-default";
  const imageSettingParts = [
    imageModelSupportsAspectRatio ? selectedAspectLabel : "",
    imageModelSupportsImageSize ? selectedSizeLabel : "",
    imageQualityOptions.length > 0 ? selectedImageQualityLabel : "",
    !hasSelectionCount && countOptions.length > 0 ? selectedCountLabel : "",
  ].filter(Boolean);
  const videoSettingParts = [
    aspectOptions.length > 0 ? selectedAspectLabel : "",
    sizeOptions.length > 0 ? selectedVideoResolutionLabel : "",
    videoQualityOptions.length > 0 ? selectedVideoQualityLabel : "",
    durationOptions.length > 0 ? selectedVideoDurationLabel : "",
    countOptions.length > 0 ? selectedCountLabel : "",
  ].filter(Boolean);
  const settingLabel =
    kind === "video"
      ? `${videoSettingParts.join(" · ")} ·`
      : kind === "image"
        ? imageSettingParts.join(" · ") || "自动"
        : "自动";
  const generateDisabled =
    generationSubmitting ||
    !canGenerate ||
    videoMethodUnavailable ||
    (hasSelectionCount && safeSelectedItemCount <= 0);
  const slashPresetMatches = useMemo(
    () =>
      presetOptions
        .filter((item) => {
          const query = slashQuery.trim().toLowerCase();
          if (!query) return true;
          return (
            item.label.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            item.id.toLowerCase().includes(query)
          );
        })
        .slice(0, 8),
    [presetOptions, slashQuery],
  );
  const groupedPresetOptions = useMemo(() => {
    const optionById = new Map(presetOptions.map((item) => [item.id, item]));
    return WORKFLOW_IMAGE_PRESET_GROUPS.map((group) => ({
      title: group.title,
      items: group.ids
        .map((id) => optionById.get(id))
        .filter((item): item is WorkflowImagePresetOption => Boolean(item)),
    })).filter((group) => group.items.length > 0);
  }, [presetOptions]);
  const mentionOptions = useMemo<WorkflowMediaMentionOption[]>(() => {
    if (!isImageNode && !isVideoNode) return [];
    const items: WorkflowMediaMentionOption[] = [];
    const pushItems = (
      kind: WorkflowMediaMentionKind,
      nodes: WorkflowUpstreamNodeSummary[],
    ) => {
      nodes.forEach((node, index) => {
        const url = String(node.mediaUrl || "").trim();
        if (!url) return;
        const label = `${getWorkflowMentionKindLabel(kind)}${index + 1}`;
        items.push({
          id: `${kind}:${node.id}`,
          kind,
          label,
          insertText: `@${label}`,
          title: String(node.title || label).trim() || label,
          url,
        });
      });
    };
    pushItems("image", [...videoInputImages, ...videoScriptReferenceImages]);
    if (isVideoNode) {
      pushItems("video", videoInputVideos);
      pushItems("audio", videoInputAudios);
    }
    return items;
  }, [
    isImageNode,
    isVideoNode,
    videoInputAudios,
    videoInputImages,
    videoInputVideos,
    videoScriptReferenceImages,
  ]);
  const filteredMentionOptions = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    if (!query) return mentionOptions;
    return mentionOptions.filter((item) =>
      `${item.label} ${item.title} ${item.kind}`.toLowerCase().includes(query),
    );
  }, [mentionOptions, mentionQuery]);
  const videoReferenceCards = useMemo(() => {
    if (!isVideoNode) return [];
    const imageItems = [
      ...videoInputImages.map((node) => ({
        id: node.id,
        kind: "image" as const,
        title: node.title || "图片",
        mediaUrl: node.mediaUrl,
        sourceId: node.id,
        seedanceAssetUrl: getWorkflowSurfaceSeedanceAssetUrl(node) || undefined,
      })),
      ...videoScriptReferenceImages.map((node) => ({
        id: node.id,
        kind: "image" as const,
        title: node.title || "脚本参考图",
        mediaUrl: node.mediaUrl,
        sourceId: node.sourceId,
      })),
    ];
    const videoItems = videoInputVideos.map((node) => ({
      id: node.id,
      kind: "video" as const,
      title: node.title || "视频",
      mediaUrl: node.mediaUrl,
    }));
    const audioItems = videoInputAudios.map((node) => ({
      id: node.id,
      kind: "audio" as const,
      title: node.title || "音频",
      mediaUrl: node.mediaUrl,
    }));
    const cards: WorkflowVideoReferenceCard[] = [];
    const appendVideoItems = (
      prefix: string,
      accept: WorkflowVideoReferenceCard["accept"] = "image-video",
    ) => {
      videoItems.slice(0, 6).forEach((item, index) => {
        cards.push({
          key: `${prefix}-video-${item.id}-${index}`,
          label: `视频${index + 1}`,
          kind: "video",
          item,
          accept,
          removable: true,
        });
      });
    };
    if (selectedVideoReferenceUiMode === "start_end") {
      cards.push(
        {
          key: "first-frame",
          label: "首帧",
          kind: "image",
          item: imageItems[0],
          accept: "image",
          removable: Boolean(
            imageItems[0] && imageItems[0].sourceId === imageItems[0].id,
          ),
        },
        {
          key: "end-frame",
          label: "尾帧",
          kind: "image",
          item: imageItems[1],
          accept: "image",
          removable: Boolean(
            imageItems[1] && imageItems[1].sourceId === imageItems[1].id,
          ),
        },
      );
      appendVideoItems("start-end");
      return cards;
    }
    if (selectedVideoReferenceUiMode === "first_frame") {
      cards.push({
        key: "first-frame",
        label: "首帧",
        kind: "image",
        item: imageItems[0],
        accept: "image",
        removable: Boolean(
          imageItems[0] && imageItems[0].sourceId === imageItems[0].id,
        ),
      });
      appendVideoItems("first-frame");
      return cards;
    }
    if (selectedVideoReferenceUiMode === "last_frame") {
      cards.push({
        key: "last-frame",
        label: "尾帧",
        kind: "image",
        item: imageItems[0],
        accept: "image",
        removable: Boolean(
          imageItems[0] && imageItems[0].sourceId === imageItems[0].id,
        ),
      });
      return cards;
    }
    if (selectedVideoRouteMode === "edit") {
      if (videoItems.length > 0) {
        videoItems.slice(0, 6).forEach((item, index) => {
          cards.push({
            key: `edit-video-${item.id}-${index}`,
            label: `视频${index + 1}`,
            kind: "video",
            item,
            accept: "image-video",
            removable: true,
          });
        });
      } else {
        cards.push({
          key: "edit-video",
          label: "视频",
          kind: "video",
          accept: "image-video",
        });
      }
      if (imageItems.length > 0) {
        imageItems.slice(0, 6).forEach((item, index) => {
          cards.push({
            key: `edit-image-${item.id}-${index}`,
            label: `图片${index + 1}`,
            kind: "image",
            item,
            accept: "image-video",
            removable: item.sourceId === item.id,
          });
        });
      } else {
        cards.push({
          key: "edit-image",
          label: "图片",
          kind: "image",
          accept: "image-video",
        });
      }
      cards.push({
        key: "edit-add",
        label: "素材",
        kind: "image",
        accept: "image-video",
      });
      return cards;
    }
    if (selectedVideoRouteMode === "audio-to-video") {
      if (audioItems.length > 0) {
        audioItems.slice(0, 6).forEach((item, index) => {
          cards.push({
            key: `audio-video-${item.id}-${index}`,
            label: `音频${index + 1}`,
            kind: "audio",
            item,
            accept: "any",
            removable: true,
          });
        });
      } else {
        cards.push({
          key: "audio-video-add",
          label: "音频",
          kind: "audio",
          accept: "any",
        });
      }
      return cards;
    }
    if (selectedVideoRouteMode === "extend") {
      if (videoItems.length > 0) {
        videoItems.slice(0, 6).forEach((item, index) => {
          cards.push({
            key: "extend-video-" + item.id + "-" + index,
            label: "视频" + (index + 1),
            kind: "video",
            item,
            accept: "image-video",
            removable: true,
          });
        });
      } else {
        cards.push({
          key: "extend-video",
          label: "待延长视频",
          kind: "video",
          accept: "image-video",
        });
      }
      return cards;
    }
    if (selectedVideoReferenceUiMode === "reference") {
      const referenceItems = [...videoItems, ...imageItems, ...audioItems];
      referenceItems.slice(0, 8).forEach((item, index) => {
        cards.push({
          key: `${item.kind}-${item.id}-${index}`,
          label:
            item.kind === "video"
              ? "视频"
              : item.kind === "audio"
                ? "音频"
                : "图片",
          kind: item.kind,
          item,
          accept: "any",
          removable: item.kind !== "image" || item.sourceId === item.id,
        });
      });
      cards.push({
        key: "reference-add",
        label: "素材",
        kind: "image",
        accept: "any",
      });
      return cards;
    }
    cards.push({
      key: "video-add",
      label: videoConnectedMediaCount > 0 ? "素材" : "参考",
      kind: "image",
      accept: "any",
    });
    return cards;
  }, [
    isVideoNode,
    selectedVideoReferenceUiMode,
    selectedVideoRouteMode,
    videoConnectedMediaCount,
    videoInputAudios,
    videoInputImages,
    videoInputVideos,
    videoScriptReferenceImages,
  ]);
  const visibleVideoReferenceCards = useMemo(
    () =>
      videoReferenceCards.filter((card) =>
        Boolean(card.item && String(card.item.mediaUrl || "").trim()),
      ),
    [videoReferenceCards],
  );
  const closePopups = useCallback(() => {
    setActivePopup(null);
    activePopupAnchorRef.current = null;
    setReferenceMenuOpen(false);
    setSlashOpen(false);
    setMentionOpen(false);
    setSlashMenuPosition(null);
  }, []);
  useEffect(() => {
    if (!activePopup && !referenceMenuOpen && !slashOpen && !mentionOpen)
      return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePopups();
      setInputExpanded(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activePopup, closePopups, mentionOpen, referenceMenuOpen, slashOpen]);
  const toggleInputExpanded = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      closePopups();
      setInputExpanded((current) => !current);
      window.requestAnimationFrame(() => promptTextareaRef.current?.focus());
    },
    [closePopups],
  );
  const openLocalReferenceUpload = useCallback((event?: React.MouseEvent) => {
    event?.stopPropagation();
    setReferenceMenuOpen(false);
    fileInputRef.current?.click();
  }, []);
  const videoUploadAccept = videoReferenceCards.some(
    (card) => card.accept === "any",
  )
    ? "image/*,video/*,audio/*"
    : videoReferenceCards.some((card) => card.accept === "image-video")
      ? "image/*,video/*"
      : videoReferenceCards.some((card) => card.accept === "video")
        ? "video/*"
        : "image/*";
  const renderVideoReferenceCard = useCallback(
    (card: (typeof videoReferenceCards)[number], visibleIndex: number) => {
      const item = card.item;
      const mediaUrl = String(item?.mediaUrl || "").trim();
      const title = item?.title || card.label;
      const hasItem = Boolean(item && mediaUrl);
      const hasSeedanceComplianceBadge = Boolean(
        item?.kind === "image" && item.seedanceAssetUrl,
      );
      return (
        <button
          key={card.key}
          type="button"
          className={`group/ref relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border transition-colors ${
            hasItem
              ? "border-white/10 bg-white/[0.06] hover:border-white/18"
              : "border-white/[0.10] bg-transparent text-white/55 hover:bg-white/[0.08] hover:text-white/78"
          }`}
          title={title}
          onClick={(event) => {
            event.stopPropagation();
            openLocalReferenceUpload(event);
          }}
        >
          {hasItem && item?.kind === "image" ? (
            <>
              <img
                src={mediaUrl}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
              <span className="absolute left-1 top-1 flex size-4 items-center justify-center rounded-full bg-black/72 text-[10px] font-medium leading-none text-white shadow-sm">
                {visibleIndex + 1}
              </span>
              {hasSeedanceComplianceBadge ? (
                <span
                  className="absolute bottom-1 right-1 z-10 flex size-[15px] items-center justify-center rounded-sm bg-black/65 p-px text-[#09CAF5]"
                  title="素材内容已合规，可用于Seedance2.0视频生成"
                  aria-label="素材内容已合规，可用于Seedance2.0视频生成"
                >
                  <ShieldCheck className="size-3" strokeWidth={2.2} />
                </span>
              ) : null}
            </>
          ) : hasItem && item?.kind === "video" ? (
            <>
              {getWorkflowVideoPosterUrl(mediaUrl) ? (
                <img
                  src={getWorkflowImageRenderUrl(
                    getWorkflowVideoPosterUrl(mediaUrl),
                  )}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center bg-black/18">
                <Play className="size-4 text-white/88" />
              </span>
              <span className="absolute left-1 top-1 flex size-4 items-center justify-center rounded-full bg-black/72 text-[10px] font-medium leading-none text-white shadow-sm">
                {visibleIndex + 1}
              </span>
            </>
          ) : hasItem && item?.kind === "audio" ? (
            <>
              <TapNowNodeIcon kind="audio" size={18} opacity={0.78} />
              <span className="absolute left-1 top-1 flex size-4 items-center justify-center rounded-full bg-black/72 text-[10px] font-medium leading-none text-white shadow-sm">
                {visibleIndex + 1}
              </span>
            </>
          ) : (
            <span className="flex flex-col items-center justify-center gap-0.5">
              <Upload className="size-4" />
              <span className="max-w-full truncate text-center text-[10px] leading-3">
                {card.label}
              </span>
            </span>
          )}
          {card.removable && item ? (
            <span
              role="button"
              tabIndex={0}
              className="absolute left-1 top-1 flex size-4 items-center justify-center rounded-full bg-black text-white opacity-0 transition-opacity group-hover/ref:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onReferenceRemoved?.(-1, item.id);
              }}
            >
              <X className="size-3" />
            </span>
          ) : null}
        </button>
      );
    },
    [onReferenceRemoved, openLocalReferenceUpload],
  );
  const togglePopup = useCallback(
    (
      popup:
        | "model"
        | "mode"
        | "ratio"
        | "style"
        | "presets"
        | "portraitTexture"
        | "camera"
        | "count"
        | "motion"
        | "characters",
      anchor?: HTMLButtonElement | null,
    ) => {
      setReferenceMenuOpen(false);
      setActivePopup((current) => {
        const next = current === popup ? null : popup;
        activePopupAnchorRef.current = next ? anchor || null : null;
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    if (promptDraftDirtyRef.current && prompt !== promptRef.current) return;
    promptDraftDirtyRef.current = false;
    promptRef.current = prompt;
  }, [prompt]);
  useEffect(() => {
    onModelChangeRef.current = onModelChange;
  }, [onModelChange]);
  useEffect(() => {
    onGenerationSettingsChangeRef.current = onGenerationSettingsChange;
  }, [onGenerationSettingsChange]);
  useEffect(() => {
    onRequestGenerationFrameRef.current = onRequestGenerationFrame;
  }, [onRequestGenerationFrame]);
  useEffect(() => {
    if (promptDraftDirtyRef.current && prompt !== promptRef.current) return;
    setDraftPrompt((current) => (current === prompt ? current : prompt));
  }, [prompt]);
  const commitModel = useCallback(
    (value: string) => {
      const selected = findWorkflowModelOptionByIdentity(modelOptions, value);
      const nextValue =
        getWorkflowModelOptionValue(selected) ||
        normalizeWorkflowModelIdentity(value);
      if (!nextValue) return;
      if (panoramaPresetLocked) return;
      const patch: Partial<LibTvWorkflowNode["data"]> = { modelId: nextValue };
      let nextVideoMethod = "";
      let nextVideoMethodOption: WorkflowRedrawChoice | undefined;
      if (isVideoNode) {
        const nextMethodOptions = normalizeWorkflowVideoMethodChoices(
          getWorkflowVideoMethodDefinitions(selected?.parameters),
        );
        nextVideoMethod = resolveWorkflowVideoMethod(
          nextMethodOptions,
          normalizeWorkflowVideoMethodValue(videoMethod),
          videoInputCounts,
        );
        nextVideoMethodOption = nextMethodOptions.find(
          (method) => method.value === nextVideoMethod,
        );
        patch.videoMethod =
          nextMethodOptions.length > 0
            ? nextVideoMethod || undefined
            : undefined;
      }

      const nextImageExecutionRoute = isImageNode
        ? resolveWorkflowImageExecutionRoute(
            selected,
            referenceImages.length > 0 ||
              upstreamNodes.some((node) => node.kind === "image"),
          )
        : null;
      const nextEndpointMethod = isVideoNode
        ? nextVideoMethod
        : nextImageExecutionRoute?.methodId || "";
      if (isImageNode) {
        patch.workflowEndpointMethod = nextEndpointMethod || undefined;
      }
      const nextExtraParameterMethod = nextEndpointMethod;
      const nextDefinitions = normalizeWorkflowExtraParameterDefinitions(
        selected?.parameters?.extraParameters,
        nextExtraParameterMethod,
      );
      const nextExtraParameters =
        getWorkflowExtraParameterDefaults(nextDefinitions);
      patch.workflowExtraParameters =
        Object.keys(nextExtraParameters).length > 0
          ? nextExtraParameters
          : undefined;

      const nextAspectOptions = normalizeWorkflowRedrawChoicesForMethod(
        selected?.parameters?.aspectRatios,
        [],
        nextEndpointMethod,
      );
      const nextAspectRatio =
        nextAspectOptions.length > 0
          ? pickWorkflowRedrawDefault(
              isVideoNode ? "" : String(aspectRatio || ""),
              selected?.parameters?.aspectRatios,
              nextAspectOptions,
              nextAspectOptions[0]?.value || "",
              nextEndpointMethod,
            )
          : "";
      if (nextAspectRatio) patch.aspectRatio = nextAspectRatio;
      else if (isImageNode || isVideoNode) patch.aspectRatio = undefined;

      const nextCountOptions = normalizeGenerationCountOptions(
        kind,
        selected?.parameters?.counts,
        nextEndpointMethod,
      );
      if (!hasSelectionCount) {
        if (nextCountOptions.length > 0) {
          const nextCountValue = pickWorkflowRedrawDefault(
            "",
            selected?.parameters?.counts,
            nextCountOptions,
            nextCountOptions[0]?.value || "",
            nextEndpointMethod,
          );
          patch.generationCount = Math.max(
            1,
            Number.parseInt(nextCountValue, 10) || 1,
          );
        } else patch.generationCount = undefined;
      }

      if (isImageNode) {
        const nextSizeOptions = normalizeWorkflowRedrawChoicesForMethod(
          selected?.parameters?.resolutions,
          [],
          nextEndpointMethod,
        );
        const nextImageSize = pickWorkflowRedrawDefault(
          "",
          selected?.parameters?.resolutions,
          nextSizeOptions,
          nextSizeOptions[0]?.value || "",
          nextEndpointMethod,
        );
        patch.imageSize = nextImageSize || undefined;
      }

      if (isVideoNode) {
        const nextResolutionOptions = normalizeWorkflowRedrawChoicesForMethod(
          selected?.parameters?.resolutions,
          [],
          nextEndpointMethod,
        );
        patch.videoResolution =
          nextResolutionOptions.length > 0
            ? pickWorkflowRedrawDefault(
                "",
                selected?.parameters?.resolutions,
                nextResolutionOptions,
                nextResolutionOptions[0]?.value || "",
                nextEndpointMethod,
              )
            : undefined;

        const nextDurationOptions = normalizeWorkflowRedrawChoicesForMethod(
          selected?.parameters?.durations,
          [],
          nextEndpointMethod,
        );
        patch.videoDuration =
          nextDurationOptions.length > 0
            ? pickWorkflowRedrawDefault(
                "",
                selected?.parameters?.durations,
                nextDurationOptions,
                nextDurationOptions[0]?.value || "",
                nextEndpointMethod,
              )
            : undefined;
      }

      const nextEndpointConfig = isVideoNode
        ? nextVideoMethodOption?.config
        : nextImageExecutionRoute?.config;
      const nextSupportsAudio = Boolean(
        isVideoNode && nextEndpointConfig?.supportsSound === true,
      );
      patch.generateAudio = nextSupportsAudio
        ? nextEndpointConfig?.defaultSound === true
        : false;
      const nextSupportsWebSearch = Boolean(
        (isImageNode || isVideoNode) &&
        nextEndpointConfig?.supportsWebSearch === true,
      );
      patch.enableWebSearch = nextSupportsWebSearch
        ? nextEndpointConfig?.defaultWebSearch === true
        : false;

      if (onGenerationSettingsChange) {
        onGenerationSettingsChange(patch);
      } else {
        onModelChange?.(nextValue);
      }
      closePopups();
    },
    [
      aspectRatio,
      closePopups,
      hasSelectionCount,
      isImageNode,
      isVideoNode,
      kind,
      modelOptions,
      onGenerationSettingsChange,
      onModelChange,
      panoramaPresetLocked,
      referenceImages.length,
      upstreamNodes,
      videoInputCounts,
      videoMethod,
    ],
  );
  const commitGenerationSettings = useCallback(
    (
      patch: Partial<
        Pick<
          LibTvWorkflowNode["data"],
          | "aspectRatio"
          | "workflowEndpointMethod"
          | "imageSize"
          | "stylePreset"
          | "referenceImages"
          | "referenceImageNodeIds"
          | "referenceImageRoles"
          | "videoMethod"
          | "videoMethodUserSelected"
          | "videoDuration"
          | "videoResolution"
          | "generateAudio"
          | "enableWebSearch"
          | "generationCount"
          | "cameraControl"
          | "videoCameraMotion"
          | "videoCharacterAssets"
          | "workflowPortraitTextureSettings"
          | "workflowExtraParameters"
        >
      >,
      options?: { keepOpen?: boolean },
    ) => {
      onGenerationSettingsChange?.(patch);
      if (!options?.keepOpen) closePopups();
    },
    [closePopups, onGenerationSettingsChange],
  );
  const commitStyleGalleryItem = useCallback(
    (item: WorkflowStyleGalleryItem) => {
      const isAuto = item.id === "auto";
      if (isAuto) {
        const nextReferenceImages = referenceImages.filter(
          (_, index) => referenceImageRoles[index] !== "style",
        );
        const nextReferenceNodeIds = referenceImageNodeIds.filter(
          (_, index) => referenceImageRoles[index] !== "style",
        );
        const nextReferenceRoles = referenceImageRoles.filter(
          (role) => role !== "style",
        );
        commitGenerationSettings({
          stylePreset: undefined,
          referenceImages: nextReferenceImages,
          referenceImageNodeIds: nextReferenceNodeIds,
          referenceImageRoles: nextReferenceRoles,
        });
        return;
      }
      const nextReferenceImages: string[] = [];
      const nextReferenceNodeIds: string[] = [];
      const nextReferenceRoles: string[] = [];
      referenceImages.forEach((url, index) => {
        if (referenceImageRoles[index] === "style") return;
        nextReferenceImages.push(url);
        nextReferenceNodeIds.push(referenceImageNodeIds[index] || "");
        nextReferenceRoles.push(referenceImageRoles[index] || "");
      });
      const styleImageUrl = String(item.imageUrl || "").trim();
      if (styleImageUrl) {
        nextReferenceImages.push(styleImageUrl);
        nextReferenceNodeIds.push("");
        nextReferenceRoles.push("style");
      }
      commitGenerationSettings({
        stylePreset: item.title,
        referenceImages: nextReferenceImages.slice(0, 14),
        referenceImageNodeIds: nextReferenceNodeIds.slice(0, 14),
        referenceImageRoles: nextReferenceRoles.slice(0, 14),
      });
    },
    [
      commitGenerationSettings,
      referenceImageNodeIds,
      referenceImageRoles,
      referenceImages,
    ],
  );
  const commitAspectRatio = useCallback(
    (value: string, options?: { keepOpen?: boolean }) => {
      if (panoramaPresetLocked) return;
      if (isImageNode && !imageModelSupportsAspectRatio) return;
      commitGenerationSettings({ aspectRatio: value }, options);
      if (value && value !== "auto") onRequestGenerationFrame?.(value);
    },
    [
      commitGenerationSettings,
      imageModelSupportsAspectRatio,
      isImageNode,
      onRequestGenerationFrame,
      panoramaPresetLocked,
    ],
  );
  const commitPrompt = useCallback(
    (value: string) => {
      if (promptCommitTimeoutRef.current !== null) {
        window.clearTimeout(promptCommitTimeoutRef.current);
        promptCommitTimeoutRef.current = null;
      }
      promptRef.current = value;
      promptDraftDirtyRef.current = value !== prompt;
      if (value !== prompt) onPromptChange(value);
    },
    [onPromptChange, prompt],
  );
  const appendSpeechText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const separator = draftPrompt.trim()
        ? /[，。！？,.!?\s]$/.test(draftPrompt)
          ? ""
          : " "
        : "";
      const next = `${draftPrompt}${separator}${trimmed}`;
      setDraftPrompt(next);
      commitPrompt(next);
    },
    [commitPrompt, draftPrompt],
  );
  const { active: listening, toggle: toggleSpeechInputRaw } =
    useApimartVoiceInput({
      language: "zh",
      onTranscript: appendSpeechText,
      onStatus: setSpeechStatus,
    });
  const toggleSpeechInput = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      toggleSpeechInputRaw();
    },
    [toggleSpeechInputRaw],
  );
  const applyGeneratedPromptText = useCallback(
    (nextPrompt: string) => {
      const cleaned = String(nextPrompt || "").trim();
      if (!cleaned) return;
      setDraftPrompt(cleaned);
      commitPrompt(cleaned);
      window.requestAnimationFrame(() => {
        promptTextareaRef.current?.focus();
        const size = cleaned.length;
        promptTextareaRef.current?.setSelectionRange(size, size);
      });
    },
    [commitPrompt],
  );
  const hidePromptOptimizeSuccessNotice = useCallback(() => {
    if (promptOptimizeSuccessNoticeTimeoutRef.current !== null) {
      window.clearTimeout(promptOptimizeSuccessNoticeTimeoutRef.current);
      promptOptimizeSuccessNoticeTimeoutRef.current = null;
    }
    setPromptOptimizeSuccessNoticeVisible(false);
  }, []);
  const showPromptOptimizeSuccessNotice = useCallback(() => {
    if (promptOptimizeSuccessNoticeTimeoutRef.current !== null) {
      window.clearTimeout(promptOptimizeSuccessNoticeTimeoutRef.current);
    }
    setPromptOptimizeSuccessNoticeVisible(true);
    promptOptimizeSuccessNoticeTimeoutRef.current = window.setTimeout(() => {
      setPromptOptimizeSuccessNoticeVisible(false);
      promptOptimizeSuccessNoticeTimeoutRef.current = null;
    }, 3200);
  }, []);
  const optimizeCurrentPrompt = useCallback(() => {
    const currentPrompt = draftPrompt.trim();
    if (!seedancePromptOptimizeAvailable) {
      message.info("提示词优化仅对 Seedance 2.0 视频模型开放");
      return;
    }
    if (!currentPrompt || promptOptimizing) return;
    setPromptOptimizing(true);
    setPromptOptimizeCopied(false);
    hidePromptOptimizeSuccessNotice();
    message.loading({
      content: "正在优化提示词...",
      key: "workflow-video-prompt-optimize",
      duration: 0,
    });
    void (async () => {
      try {
        const referenceManifest = videoReferenceCards
          .filter((card) => card.item)
          .map((card) => ({
            kind: card.kind,
            label: card.label,
            title: String(card.item?.title || card.label).trim() || card.label,
          }));
        const referenceImageUrls = Array.from(
          new Set(
            videoReferenceCards
              .filter((card) => card.kind === "image")
              .map((card) => String(card.item?.mediaUrl || "").trim())
              .filter(Boolean),
          ),
        ).slice(0, 8);
        const formData = new FormData();
        formData.append("prompt", currentPrompt);
        formData.append("videoModelId", selectedModelValue);
        formData.append("videoMethod", selectedVideoMethod);
        formData.append("aspectRatio", selectedAspectRatio);
        formData.append("duration", selectedVideoDuration);
        formData.append("resolution", selectedVideoResolution);
        formData.append("generateAudio", String(selectedGenerateAudio));
        formData.append("referenceManifest", JSON.stringify(referenceManifest));
        if (selectedModelValue) formData.append("modelId", selectedModelValue);
        const referenceFiles = await Promise.all(
          referenceImageUrls.map((url, index) =>
            convertWorkflowImageUrlToFile(url, index),
          ),
        );
        referenceFiles.forEach((file) => {
          if (file) formData.append("referenceImages", file, file.name);
        });
        const response = await fetch("/api/seedance/prompt-agent", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || "提示词优化失败"));
        }
        const optimizedPrompt = String(payload?.optimizedPrompt || "").trim();
        if (!optimizedPrompt) {
          throw new Error("提示词优化返回为空");
        }
        setPromptOptimizedResult(optimizedPrompt);
        setPromptOptimizeDialogOpen(false);
        message.destroy("workflow-video-prompt-optimize");
        showPromptOptimizeSuccessNotice();
      } catch (error: any) {
        hidePromptOptimizeSuccessNotice();
        message.error({
          content: String(error?.message || "提示词优化失败"),
          key: "workflow-video-prompt-optimize",
        });
      } finally {
        setPromptOptimizing(false);
      }
    })();
  }, [
    draftPrompt,
    promptOptimizing,
    seedancePromptOptimizeAvailable,
    selectedAspectRatio,
    selectedGenerateAudio,
    selectedModelValue,
    selectedVideoDuration,
    selectedVideoMethod,
    selectedVideoResolution,
    videoReferenceCards,
    hidePromptOptimizeSuccessNotice,
    showPromptOptimizeSuccessNotice,
  ]);
  const closePromptOptimizeDialog = useCallback(() => {
    setPromptOptimizeDialogOpen(false);
  }, []);
  const fillOptimizedPromptIntoInput = useCallback(() => {
    if (!promptOptimizedResult.trim()) return;
    applyGeneratedPromptText(promptOptimizedResult);
    setPromptOptimizeDialogOpen(false);
  }, [applyGeneratedPromptText, promptOptimizedResult]);
  const copyOptimizedPrompt = useCallback(() => {
    const text = promptOptimizedResult.trim();
    if (!text) return;
    if (promptOptimizeCopiedTimeoutRef.current !== null) {
      window.clearTimeout(promptOptimizeCopiedTimeoutRef.current);
      promptOptimizeCopiedTimeoutRef.current = null;
    }
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setPromptOptimizeCopied(true);
        promptOptimizeCopiedTimeoutRef.current = window.setTimeout(() => {
          setPromptOptimizeCopied(false);
          promptOptimizeCopiedTimeoutRef.current = null;
        }, 1600);
      })
      .catch(() => {
        message.error("复制失败");
      });
  }, [promptOptimizedResult]);
  const handlePromptOptimizeButtonClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!seedancePromptOptimizeAvailable) {
        message.info("提示词优化仅对 Seedance 2.0 视频模型开放");
        return;
      }
      if (promptOptimizing) return;
      if (promptOptimizedResult.trim()) {
        hidePromptOptimizeSuccessNotice();
        setPromptOptimizeDialogOpen(true);
        return;
      }
      optimizeCurrentPrompt();
    },
    [
      hidePromptOptimizeSuccessNotice,
      optimizeCurrentPrompt,
      promptOptimizedResult,
      promptOptimizing,
      seedancePromptOptimizeAvailable,
    ],
  );
  const translateCurrentPrompt = useCallback(() => {
    const currentPrompt = draftPrompt.trim();
    if (!currentPrompt || promptTranslating) return;
    const containsChinese = /[\u4e00-\u9fff]/.test(currentPrompt);
    const targetLanguage = containsChinese ? "English" : "简体中文";
    setPromptTranslating(true);
    message.loading({
      content: containsChinese
        ? "正在翻译为英文提示词..."
        : "正在翻译为中文提示词...",
      key: "workflow-video-prompt-translate",
      duration: 0,
    });
    void (async () => {
      try {
        const response = await fetch("/api/prompt/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prompt: currentPrompt,
            modelId: selectedModelValue,
            targetLanguage,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || "提示词翻译失败"));
        }
        const translatedPrompt = String(payload?.translatedPrompt || "").trim();
        if (!translatedPrompt) {
          throw new Error("提示词翻译返回为空");
        }
        applyGeneratedPromptText(translatedPrompt);
        message.success({
          content: containsChinese
            ? "已翻译为英文提示词"
            : "已翻译为中文提示词",
          key: "workflow-video-prompt-translate",
        });
      } catch (error: any) {
        message.error({
          content: String(error?.message || "提示词翻译失败"),
          key: "workflow-video-prompt-translate",
        });
      } finally {
        setPromptTranslating(false);
      }
    })();
  }, [
    applyGeneratedPromptText,
    draftPrompt,
    promptTranslating,
    selectedModelValue,
  ]);
  const showDevelopmentNotice = useCallback(
    (event: React.MouseEvent, label?: string) => {
      event.stopPropagation();
      closePopups();
      message.info(label ? `${label} 开发中` : "开发中");
    },
    [closePopups],
  );
  const uploadReferenceFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (files.length > 0) onReferenceFilesUploaded?.(files);
    },
    [onReferenceFilesUploaded],
  );
  const updateSlashState = useCallback(
    (value: string, cursor = value.length) => {
      const beforeCursor = value.slice(0, cursor);
      const slashMatch = beforeCursor.match(/\/([\w\u4e00-\u9fa5-]*)$/);
      const nextSlashQuery = slashMatch?.[1] || "";
      const nextSlashOpen = Boolean(slashMatch && isImageNode);
      setSlashQuery((current) =>
        current === nextSlashQuery ? current : nextSlashQuery,
      );
      setSlashOpen((current) =>
        current === nextSlashOpen ? current : nextSlashOpen,
      );
      const mentionTrigger = resolveWorkflowMentionTrigger(value, cursor);
      const nextMentionQuery = mentionTrigger?.query || "";
      const nextMentionOpen = Boolean(
        mentionTrigger &&
        (isImageNode || isVideoNode) &&
        mentionOptions.length > 0,
      );
      setMentionQuery((current) =>
        current === nextMentionQuery ? current : nextMentionQuery,
      );
      setMentionOpen((current) =>
        current === nextMentionOpen ? current : nextMentionOpen,
      );
      if (mentionTrigger)
        setMentionIndex((current) => (current === 0 ? current : 0));
    },
    [isImageNode, isVideoNode, mentionOptions.length],
  );
  const updateSlashMenuPosition = useCallback(() => {
    const nextPosition = resolveWorkflowSlashMenuPosition(
      promptTextareaRef.current,
    );
    setSlashMenuPosition((current) => {
      if (!current && !nextPosition) return current;
      if (
        current &&
        nextPosition &&
        current.top === nextPosition.top &&
        current.left === nextPosition.left &&
        current.width === nextPosition.width
      ) {
        return current;
      }
      return nextPosition;
    });
  }, []);
  const insertWorkflowMention = useCallback(
    (option: WorkflowMediaMentionOption) => {
      const textarea = promptTextareaRef.current;
      const selectionStart = textarea?.selectionStart ?? draftPrompt.length;
      const selectionEnd = textarea?.selectionEnd ?? selectionStart;
      const { nextValue, nextCursor } = insertWorkflowMentionAtCursor(
        draftPrompt,
        selectionStart,
        selectionEnd,
        option.insertText,
      );
      setDraftPrompt(nextValue);
      commitPrompt(nextValue);
      setMentionOpen(false);
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [commitPrompt, draftPrompt],
  );
  const selectSlashPreset = useCallback(
    (preset: WorkflowImagePresetOption) => {
      if (!isImageNode || !preset.id) return;
      setSlashOpen(false);
      setSlashQuery("");
      setSlashMenuPosition(null);
      const currentPrompt = removeWorkflowSlashCommand(
        String(promptRef.current || draftPrompt || ""),
      );
      const lockedPanorama = preset.id === "panorama-720";
      const lockedModelValue = lockedPanorama
        ? resolveWorkflowGptImage2ModelValue(modelOptions)
        : "";
      const presetAspectRatio = lockedPanorama
        ? "2:1"
        : imageModelSupportsAspectRatio
          ? String(preset.defaultAspectRatio || selectedAspectRatio || "")
          : "";
      const presetImageSize = imageModelSupportsImageSize
        ? String(preset.defaultImageSize || selectedImageSize || "")
        : "";
      const nextReferenceImages: string[] = [];
      const nextReferenceNodeIds: string[] = [];
      const nextReferenceRoles: string[] = [];
      referenceImages.forEach((url, index) => {
        const role = referenceImageRoles[index] || "";
        if (role === "style" || role === "focus") return;
        nextReferenceImages.push(url);
        nextReferenceNodeIds.push(referenceImageNodeIds[index] || "");
        nextReferenceRoles.push(role);
      });
      if (promptCommitTimeoutRef.current !== null) {
        window.clearTimeout(promptCommitTimeoutRef.current);
        promptCommitTimeoutRef.current = null;
      }
      promptRef.current = currentPrompt;
      promptDraftDirtyRef.current = currentPrompt !== prompt;
      setDraftPrompt(currentPrompt);
      onPromptChange(currentPrompt);
      setInputExpanded(false);
      setActivePopup(null);
      setReferenceMenuOpen(false);
      setMentionOpen(false);
      if (presetAspectRatio) onRequestGenerationFrame?.(presetAspectRatio);
      onGenerationSettingsChange?.({
        prompt: currentPrompt,
        selectedOptionId: preset.id,
        stylePreset: undefined,
        referenceImages: nextReferenceImages,
        referenceImageNodeIds: nextReferenceNodeIds,
        referenceImageRoles: nextReferenceRoles,
        ...(presetAspectRatio ? { aspectRatio: presetAspectRatio } : {}),
        ...(presetImageSize ? { imageSize: presetImageSize } : {}),
        ...(lockedModelValue ? { modelId: lockedModelValue } : {}),
        workflowGenerationError: "",
      } as Partial<LibTvWorkflowNode["data"]>);
    },
    [
      draftPrompt,
      imageModelSupportsAspectRatio,
      imageModelSupportsImageSize,
      isImageNode,
      modelOptions,
      onGenerationSettingsChange,
      onModelChange,
      onPromptChange,
      onRequestGenerationFrame,
      prompt,
      referenceImageNodeIds,
      referenceImageRoles,
      referenceImages,
      selectedAspectRatio,
      selectedImageSize,
    ],
  );

  const schedulePromptCommit = useCallback(
    (value: string) => {
      setDraftPrompt(value);
      promptRef.current = value;
      promptDraftDirtyRef.current = value !== prompt;
      if (promptCommitTimeoutRef.current !== null) {
        window.clearTimeout(promptCommitTimeoutRef.current);
      }
      promptCommitTimeoutRef.current = window.setTimeout(() => {
        promptCommitTimeoutRef.current = null;
        if (value !== promptRef.current) return;
        if (value !== prompt) onPromptChange(value);
      }, 360);
    },
    [onPromptChange, prompt],
  );

  useEffect(() => {
    if (promptDraftDirtyRef.current && prompt !== promptRef.current) return;
    setDraftPrompt((current) => (current === prompt ? current : prompt));
  }, [prompt]);
  useEffect(() => {
    updateSlashState(draftPrompt, draftPrompt.length);
  }, [draftPrompt, updateSlashState]);
  useEffect(() => {
    if (!slashOpen) {
      setSlashMenuPosition((current) => (current === null ? current : null));
      return;
    }
    updateSlashMenuPosition();
    window.addEventListener("resize", updateSlashMenuPosition);
    window.addEventListener("scroll", updateSlashMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateSlashMenuPosition);
      window.removeEventListener("scroll", updateSlashMenuPosition, true);
    };
  }, [slashOpen, updateSlashMenuPosition]);
  useEffect(() => {
    if (!mentionOpen) return;
    if (filteredMentionOptions.length === 0) {
      setMentionIndex((current) => (current === 0 ? current : 0));
      return;
    }
    if (mentionIndex >= filteredMentionOptions.length) {
      setMentionIndex((current) =>
        current === filteredMentionOptions.length - 1
          ? current
          : filteredMentionOptions.length - 1,
      );
    }
  }, [filteredMentionOptions.length, mentionIndex, mentionOpen]);
  useEffect(() => {
    if (!selectedModel || (!isImageNode && !isVideoNode)) return;
    if (isImageNode && panoramaPresetLocked) return;
    const patch: Partial<
      Pick<
        LibTvWorkflowNode["data"],
        | "aspectRatio"
        | "workflowEndpointMethod"
        | "imageSize"
        | "videoMethod"
        | "videoDuration"
        | "videoResolution"
        | "generateAudio"
        | "enableWebSearch"
        | "generationCount"
        | "workflowExtraParameters"
      >
    > = {};
    const currentVideoMethod = String(videoMethod || "").trim();
    const currentEndpointMethod = String(workflowEndpointMethod || "").trim();
    if (isImageNode && currentEndpointMethod !== selectedImageEndpointMethod) {
      patch.workflowEndpointMethod = selectedImageEndpointMethod || undefined;
    }
    if (
      isVideoNode &&
      (!currentVideoMethod ||
        !workflowChoiceValueExists(currentVideoMethod, methodOptions)) &&
      videoMethod !== selectedVideoMethod
    ) {
      patch.videoMethod = selectedVideoMethod;
    }
    if (isVideoNode) {
      if (aspectOptions.length > 0 && aspectRatio !== selectedAspectRatio)
        patch.aspectRatio = selectedAspectRatio;
      else if (aspectOptions.length === 0 && aspectRatio !== undefined)
        patch.aspectRatio = undefined;
    } else if (
      imageModelSupportsAspectRatio &&
      aspectRatio !== selectedAspectRatio
    ) {
      patch.aspectRatio = selectedAspectRatio;
    } else if (
      isImageNode &&
      !imageModelSupportsAspectRatio &&
      aspectRatio !== undefined
    ) {
      patch.aspectRatio = undefined;
    }
    if (
      isImageNode &&
      imageModelSupportsImageSize &&
      imageSize !== selectedImageSize
    )
      patch.imageSize = selectedImageSize;
    else if (
      isImageNode &&
      !imageModelSupportsImageSize &&
      imageSize !== undefined
    )
      patch.imageSize = undefined;
    if (
      isVideoNode &&
      sizeOptions.length > 0 &&
      videoResolution !== selectedVideoResolution
    )
      patch.videoResolution = selectedVideoResolution;
    else if (
      isVideoNode &&
      sizeOptions.length === 0 &&
      videoResolution !== undefined
    )
      patch.videoResolution = undefined;
    if (
      isVideoNode &&
      durationOptions.length > 0 &&
      videoDuration !== selectedVideoDuration
    )
      patch.videoDuration = selectedVideoDuration;
    else if (
      isVideoNode &&
      durationOptions.length === 0 &&
      videoDuration !== undefined
    )
      patch.videoDuration = undefined;
    if (isVideoNode && supportsVideoAudio && typeof generateAudio !== "boolean")
      patch.generateAudio = defaultVideoAudioEnabled;
    if (isVideoNode && !supportsVideoAudio && generateAudio === true)
      patch.generateAudio = false;
    if (
      (isImageNode || isVideoNode) &&
      supportsWebSearch &&
      typeof enableWebSearch !== "boolean"
    )
      patch.enableWebSearch = defaultWebSearchEnabled;
    if (
      (isImageNode || isVideoNode) &&
      !supportsWebSearch &&
      enableWebSearch === true
    )
      patch.enableWebSearch = false;
    if (
      !hasSelectionCount &&
      countOptions.length === 0 &&
      generationCount !== undefined
    ) {
      patch.generationCount = undefined;
    } else if (
      !hasSelectionCount &&
      countOptions.length > 0 &&
      generationCount !== selectedCountNumber
    ) {
      patch.generationCount = selectedCountNumber;
    }
    const normalizedExtraParameters = resolvedWorkflowExtraParameters;
    const currentExtraSignature = JSON.stringify(workflowExtraParameters || {});
    const nextExtraSignature = JSON.stringify(normalizedExtraParameters);
    if (currentExtraSignature !== nextExtraSignature) {
      patch.workflowExtraParameters =
        Object.keys(normalizedExtraParameters).length > 0
          ? normalizedExtraParameters
          : undefined;
    }
    const patchKeys = Object.keys(patch);
    if (patchKeys.length > 0) {
      const patchSignature = patchKeys
        .sort()
        .map((key) => {
          const value = (patch as Record<string, unknown>)[key];
          return `${key}:${value && typeof value === "object" ? JSON.stringify(value) : String(value)}`;
        })
        .join("|");
      if (patchSignature === lastAutoSettingsPatchRef.current) return;
      lastAutoSettingsPatchRef.current = patchSignature;
      onGenerationSettingsChangeRef.current?.(patch);
    } else {
      lastAutoSettingsPatchRef.current = "";
    }
  }, [
    aspectOptions.length,
    aspectRatio,
    countOptions.length,
    defaultVideoAudioEnabled,
    defaultWebSearchEnabled,
    durationOptions.length,
    enableWebSearch,
    generateAudio,
    generationCount,
    hasSelectionCount,
    imageModelSupportsAspectRatio,
    imageModelSupportsImageSize,
    imageSize,
    isImageNode,
    isVideoNode,
    methodOptions,
    panoramaPresetLocked,
    resolvedWorkflowExtraParameters,
    selectedAspectRatio,
    selectedCountNumber,
    selectedImageSize,
    selectedImageEndpointMethod,
    selectedModel,
    selectedVideoDuration,
    selectedVideoMethod,
    selectedVideoResolution,
    sizeOptions.length,
    supportsVideoAudio,
    supportsWebSearch,
    videoDuration,
    videoMethod,
    videoResolution,
    workflowExtraParameters,
    workflowEndpointMethod,
  ]);

  useEffect(() => {
    return () => {
      if (promptCommitTimeoutRef.current !== null) {
        window.clearTimeout(promptCommitTimeoutRef.current);
      }
      if (promptOptimizeSuccessNoticeTimeoutRef.current !== null) {
        window.clearTimeout(promptOptimizeSuccessNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const closeMenus = () => closePopups();
    window.addEventListener(WORKFLOW_NODE_CLOSE_MENUS_EVENT, closeMenus);
    return () =>
      window.removeEventListener(WORKFLOW_NODE_CLOSE_MENUS_EVENT, closeMenus);
  }, [closePopups]);

  useEffect(() => {
    if (!activePopup || activePopup === "style") return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (!target) return;
      if (
        target instanceof Element &&
        target.closest(SEEDANCE_AVATAR_POPUP_SELECTOR)
      )
        return;
      if (activePopupRef.current?.contains(target)) return;
      if (activePopupAnchorRef.current?.contains(target)) return;
      closePopups();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [activePopup, closePopups]);

  useEffect(() => {
    let cancelled = false;
    const applyCached = () => {
      const cached = workflowModelOptionsCache.get(modelCategory);
      if (!cancelled && cached) {
        setModelOptions(cached);
        setModelsLoading(false);
        return true;
      }
      return false;
    };
    workflowModelOptionsListeners.add(applyCached);
    if (applyCached()) {
      return () => {
        cancelled = true;
        workflowModelOptionsListeners.delete(applyCached);
      };
    }
    setModelsLoading(true);
    fetchWorkflowModelOptions(modelCategory)
      .then((next) => {
        if (cancelled) return;
        setModelOptions(next);
      })
      .catch(() => {
        if (!cancelled) setModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
      workflowModelOptionsListeners.delete(applyCached);
    };
  }, [modelCategory]);

  useEffect(() => {
    const currentModelId = String(modelId || "").trim();
    if (modelOptions.length === 0) return;
    const resolved = findWorkflowModelOptionByIdentity(
      modelOptions,
      currentModelId,
    );
    if (!resolved) {
      const fallback =
        modelOptions.find((model) => model.isDefault) || modelOptions[0];
      const fallbackValue = getWorkflowModelOptionValue(fallback);
      if (fallbackValue && fallbackValue !== currentModelId) {
        onModelChangeRef.current?.(fallbackValue);
      }
      return;
    }
    if (!currentModelId || currentModelId.includes("@@")) return;
    const explicitValue = getWorkflowModelOptionValue(resolved);
    if (
      resolved?.providerKey &&
      explicitValue &&
      explicitValue !== currentModelId
    ) {
      onModelChangeRef.current?.(explicitValue);
    }
  }, [modelId, modelOptions]);
  useEffect(() => {
    if (!isImageNode || !panoramaPresetLocked) return;
    const lockedModelValue = resolveWorkflowGptImage2ModelValue(modelOptions);
    const patch: Partial<LibTvWorkflowNode["data"]> = {};
    if (String(modelId || "") !== lockedModelValue)
      patch.modelId = lockedModelValue;
    if (String(aspectRatio || "") !== "2:1") patch.aspectRatio = "2:1";
    if (activePopup === "model") setActivePopup(null);
    if (Object.keys(patch).length > 0) {
      onGenerationSettingsChangeRef.current?.(patch);
      onRequestGenerationFrameRef.current?.("2:1");
    }
  }, [
    activePopup,
    aspectRatio,
    imageSize,
    isImageNode,
    modelId,
    modelOptions,
    panoramaPresetLocked,
  ]);

  const anchoredPopupClassName =
    activePopup === "model"
      ? "rounded-2xl border-[0.5px] border-card-border bg-panel-background/95 p-1 text-sm text-fg-default shadow-[0_1px_3px_rgba(0,0,0,0.05),0_20px_25px_-5px_rgba(0,0,0,0.05),0_10px_10px_-5px_rgba(0,0,0,0.04)] backdrop-blur-[32px]"
      : activePopup === "mode"
        ? "rounded-2xl border-[0.5px] border-border-muted bg-panel-background/95 p-0 text-sm text-fg-default shadow-[var(--canvas-shadow-dropdown)] backdrop-blur-[16px]"
        : activePopup === "camera"
          ? "w-max rounded-xl border border-border-muted bg-panel-background p-0 text-sm text-fg-default shadow-[var(--canvas-shadow-dropdown)]"
          : activePopup === "portraitTexture"
            ? "w-[min(392px,calc(100vw-24px))] rounded-2xl border-hair border-card-border bg-panel-background/95 p-3 text-sm text-fg-default shadow-[var(--canvas-shadow-dropdown)] backdrop-blur-[16px]"
            : activePopup === "presets"
              ? "w-[min(714px,calc(100vw-24px))] rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-2 text-sm text-fg-default shadow-[var(--canvas-shadow-dropdown)] backdrop-blur-2xl"
              : activePopup === "motion"
                ? "w-[min(721px,calc(100vw-24px))] rounded-xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] text-sm text-fg-default shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
                : activePopup === "ratio" && (isVideoNode || isImageNode)
                  ? `${isImageNode ? "w-[min(380px,calc(100vw-24px))]" : "w-[min(340px,calc(100vw-24px))]"} rounded-2xl border-[0.5px] border-border-muted bg-panel-background/95 p-0 text-sm text-fg-default shadow-[var(--canvas-shadow-dropdown)] backdrop-blur-[32px]`
                  : activePopup === "count"
                    ? "w-32 rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-1.5 text-sm text-fg-default shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
                    : "w-64 rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-1.5 text-sm text-fg-default shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl";
  const anchoredPopupHeightLimit =
    activePopup === "model"
      ? 409
      : activePopup === "ratio" && isVideoNode
        ? 445
        : activePopup === "count"
          ? 320
          : undefined;
  const anchoredPopupAlign = activePopup === "model" ? "start" : "center";
  const anchoredPopupOverflowY =
    activePopup === "ratio" && isImageNode ? "visible" : "auto";
  const anchoredPopupContent =
    activePopup === "model" ? (
      <ModelPopupList
        title={
          kind === "image"
            ? "图片模型"
            : kind === "video"
              ? "视频模型"
              : kind === "script"
                ? "脚本模型"
                : "文本模型"
        }
        models={modelOptions}
        loading={modelsLoading}
        selected={selectedModelValue}
        onSelect={commitModel}
      />
    ) : activePopup === "mode" && isVideoNode ? (
      <VideoModePopup
        items={methodOptions}
        selected={selectedVideoMethod}
        availability={videoMethodAvailability}
        onSelect={(value) => {
          if (!videoMethodAvailability.get(value)?.disabled) {
            const method = methodOptions.find((item) => item.value === value);
            const routeMode = getWorkflowVideoMethodRouteMode(method);
            const defaults =
              method?.config?.defaults &&
              typeof method.config.defaults === "object"
                ? (method.config.defaults as Record<string, any>)
                : {};
            const nextDefinitions = normalizeWorkflowExtraParameterDefinitions(
              selectedModel?.parameters?.extraParameters,
              value,
            );
            const nextExtraParameters =
              getWorkflowExtraParameterDefaults(nextDefinitions);
            const configuredExtraDefaults =
              defaults.extraParameters &&
              typeof defaults.extraParameters === "object"
                ? (defaults.extraParameters as Record<
                    string,
                    WorkflowExtraParameterValue
                  >)
                : {};
            Object.assign(nextExtraParameters, configuredExtraDefaults);
            for (const key of ["name", "assets"]) {
              if (
                (routeMode === "drama" || routeMode === "drama_clip") &&
                workflowExtraParameters?.[key] !== undefined &&
                nextDefinitions.some((definition) => definition.type === key)
              )
                nextExtraParameters[key] = workflowExtraParameters[key];
            }
            commitGenerationSettings({
              videoMethod: value,
              videoMethodUserSelected: true,
              aspectRatio:
                String(
                  defaults.aspectRatio || defaults.aspect_ratio || "",
                ).trim() || undefined,
              videoResolution:
                String(defaults.resolution || "").trim() || undefined,
              videoDuration:
                String(defaults.duration || "").trim() || undefined,
              workflowExtraParameters:
                Object.keys(nextExtraParameters).length > 0
                  ? nextExtraParameters
                  : undefined,
            });
          }
          closePopups();
        }}
      />
    ) : activePopup === "count" ? (
      <GenerationPopupList
        title="生成数量"
        items={countOptions.map((item) => item.label)}
        selected={selectedCountLabel}
        onSelect={(item) => {
          const matched =
            countOptions.find((option) => option.label === item) ||
            countOptions[0];
          commitGenerationSettings({
            generationCount: Math.max(
              1,
              Number.parseInt(matched?.value || "1", 10) || 1,
            ),
          });
          closePopups();
        }}
      />
    ) : activePopup === "ratio" && isImageNode ? (
      <ImageSizePopup
        aspectOptions={
          panoramaPresetLocked
            ? []
            : imageModelSupportsAspectRatio
              ? aspectOptions
              : []
        }
        sizeOptions={imageModelSupportsImageSize ? sizeOptions : []}
        qualityOptions={imageQualityOptions}
        countOptions={hasSelectionCount ? [] : countOptions}
        selectedAspect={selectedAspectRatio}
        selectedSize={selectedImageSize}
        selectedQuality={selectedImageQuality}
        selectedCount={selectedCountLabel}
        onAspectSelect={(value) => commitAspectRatio(value, { keepOpen: true })}
        onSizeSelect={(value) => {
          if (!imageModelSupportsImageSize) return;
          commitGenerationSettings({ imageSize: value }, { keepOpen: true });
        }}
        onQualitySelect={(value) => {
          const qualityKey = selectedImageQualityDefinition?.type || "quality";
          commitGenerationSettings(
            {
              workflowExtraParameters: {
                ...(workflowExtraParameters || {}),
                [qualityKey]: value,
              },
            },
            { keepOpen: true },
          );
        }}
        onCountSelect={(value) =>
          commitGenerationSettings(
            { generationCount: Math.max(1, Number.parseInt(value, 10) || 1) },
            { keepOpen: true },
          )
        }
      />
    ) : activePopup === "ratio" && isVideoNode ? (
      <VideoSettingsPopup
        aspectOptions={aspectOptions}
        resolutionOptions={sizeOptions}
        qualityOptions={videoQualityOptions}
        durationOptions={durationOptions}
        countOptions={hasSelectionCount ? [] : countOptions}
        selectedAspect={selectedAspectRatio}
        selectedResolution={selectedVideoResolution}
        selectedQuality={selectedVideoQuality}
        selectedDuration={selectedVideoDuration}
        selectedCount={selectedCountValue}
        supportsAudio={supportsVideoAudio}
        audioEnabled={selectedGenerateAudio}
        onAspectSelect={(value) => commitAspectRatio(value, { keepOpen: true })}
        onResolutionSelect={(value) =>
          commitGenerationSettings(
            { videoResolution: value },
            { keepOpen: true },
          )
        }
        onQualitySelect={(value) => {
          const qualityKey = selectedVideoQualityDefinition?.type || "quality";
          commitGenerationSettings(
            {
              workflowExtraParameters: {
                ...(workflowExtraParameters || {}),
                [qualityKey]: value,
              },
            },
            { keepOpen: true },
          );
        }}
        onDurationSelect={(value) =>
          commitGenerationSettings({ videoDuration: value }, { keepOpen: true })
        }
        onCountSelect={(value) =>
          commitGenerationSettings(
            { generationCount: Math.max(1, Number.parseInt(value, 10) || 1) },
            { keepOpen: true },
          )
        }
        onAudioEnabledChange={(value) =>
          commitGenerationSettings({ generateAudio: value }, { keepOpen: true })
        }
      />
    ) : activePopup === "motion" && isVideoNode ? (
      <VideoCameraMotionPopup
        selectedId={videoCameraMotion?.id}
        onSelect={(preset) =>
          commitGenerationSettings({ videoCameraMotion: preset })
        }
        onClear={() =>
          commitGenerationSettings({ videoCameraMotion: undefined })
        }
        onClose={closePopups}
      />
    ) : activePopup === "camera" && isImageNode ? (
      <CameraControlPopup
        value={selectedCameraControl}
        onSave={(next) => {
          onGenerationSettingsChange?.({ cameraControl: next });
          closePopups();
        }}
        onClose={closePopups}
      />
    ) : activePopup === "portraitTexture" && isImageNode ? (
      <PortraitTextureSettingsPopup
        value={workflowPortraitTextureSettings}
        onChange={(next) =>
          commitGenerationSettings(
            { workflowPortraitTextureSettings: next },
            { keepOpen: true },
          )
        }
      />
    ) : activePopup === "presets" && isImageNode ? (
      <WorkflowImagePresetShortcutPopup
        groups={groupedPresetOptions}
        runningId={null}
        selectedId={selectedImagePresetId}
        onSelect={selectSlashPreset}
      />
    ) : null;
  const anchoredPopup =
    activePopup &&
    activePopup !== "style" &&
    activePopup !== "characters" &&
    (activePopup !== "motion" || isVideoNode) &&
    anchoredPopupContent ? (
      <WorkflowAnchoredPopover
        anchorRef={activePopupAnchorRef}
        popoverRef={activePopupRef}
        side="top"
        align={anchoredPopupAlign}
        gap={0}
        margin={12}
        heightLimit={anchoredPopupHeightLimit}
        overflowY={anchoredPopupOverflowY}
        ariaLabel={
          activePopup === "model"
            ? kind === "image"
              ? "图片模型"
              : kind === "video"
                ? "视频模型"
                : kind === "script"
                  ? "脚本模型"
                  : "文本模型"
            : activePopup === "mode"
              ? selectedVideoMethodLabel
              : undefined
        }
        testId={"workflow-" + activePopup + "-popover"}
        className={anchoredPopupClassName}
      >
        {anchoredPopupContent}
      </WorkflowAnchoredPopover>
    ) : null;

  if (isTextNode) {
    return (
      <>
        <div
          ref={barRef}
          className={`node-floating-ui nodrag nowheel nopan pointer-events-auto absolute -bottom-4 left-1/2 z-20 w-full min-w-[660px] max-w-[660px] -translate-x-1/2 translate-y-full origin-top cursor-default ${inputExpanded ? "workflow-generation-bar-expanded" : ""}`}
          data-canvas-generator-root=""
          data-floating-ui-shell="true"
          data-testid="canvas-node-generation-input-bar"
          style={{
            transform: "translateX(-50%) translateY(100%) scale(1)",
          }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onDoubleClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <div
            data-generator-card=""
            className="relative flex w-full flex-col gap-0 overflow-visible rounded-xl border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[var(--canvas-shadow-panel)]"
          >
            <div className="flex min-h-0 w-full flex-col">
              <div className="flex min-h-0 flex-col gap-2 p-2">
                <div className="flex items-center gap-2" />
                <div className="relative flex gap-1">
                  <div
                    className={`relative flex-1 overflow-hidden rounded-xl p-1 ${inputExpanded ? "min-h-[320px]" : "min-h-20"}`}
                  >
                    {!draftPrompt ? (
                      <p className="pointer-events-none absolute left-1 top-1 m-0 w-full select-none whitespace-pre-wrap text-sm leading-[1.8] text-neutral-500">
                        {LIBTV_TEXT_GENERATOR_PROMPT_PLACEHOLDER}
                      </p>
                    ) : null}
                    <textarea
                      ref={promptTextareaRef}
                      aria-label="描述"
                      value={draftPrompt}
                      placeholder=""
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={stopWorkflowNodeChromeEvent}
                      onKeyUp={(event) =>
                        updateSlashState(
                          event.currentTarget.value,
                          event.currentTarget.selectionStart ??
                            event.currentTarget.value.length,
                        )
                      }
                      onChange={(event) => {
                        schedulePromptCommit(event.target.value);
                        updateSlashState(
                          event.target.value,
                          event.target.selectionStart ??
                            event.target.value.length,
                        );
                        updateSlashMenuPosition();
                      }}
                      onKeyDown={(event) => stopWorkflowNodeChromeEvent(event)}
                      onSelect={(event) =>
                        updateSlashState(
                          event.currentTarget.value,
                          event.currentTarget.selectionStart ??
                            event.currentTarget.value.length,
                        )
                      }
                      onBlur={() => commitPrompt(draftPrompt)}
                      className={`${inputExpanded ? "h-[320px] max-h-[420px] min-h-[320px]" : "min-h-20 max-h-[100px]"} relative z-10 -mr-1 w-full resize-none overflow-y-auto whitespace-pre-wrap border-0 bg-transparent pr-1.5 text-sm leading-[1.8] text-fg-default outline-none transition-[height] duration-200 ease-out placeholder:text-fg-subtle focus:outline-none focus:ring-0`}
                      rows={1}
                    />
                  </div>
                </div>
                <div className="flex w-full items-center gap-1">
                  <button
                    type="button"
                    className="flex h-8 min-w-0 shrink cursor-pointer items-center justify-between gap-1 rounded-lg bg-transparent px-2 py-1 transition-colors hover:bg-canvas-controls-hover"
                    data-testid="canvas-node-image-model-select"
                    aria-haspopup="listbox"
                    aria-expanded={activePopup === "model"}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePopup("model", event.currentTarget);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <WorkflowModelIcon
                        iconUrl={selectedModelIconUrl}
                        name={modelLabel}
                      />
                      <span
                        className="truncate text-[13px] text-fg-default"
                        title={modelLabel}
                      >
                        {modelsLoading ? "加载模型..." : modelLabel}
                      </span>
                      <WorkflowModelBadges model={selectedModel} />
                    </div>
                    <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
                  </button>
                  <div className="flex-1" />
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={promptTranslating || !draftPrompt.trim()}
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="翻译"
                      title="翻译"
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={(event) => {
                        event.stopPropagation();
                        translateCurrentPrompt();
                      }}
                    >
                      {promptTranslating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <WorkflowVideoTranslateButtonIcon />
                      )}
                    </button>
                    <div className="flex h-8 items-center gap-2 text-fg-muted">
                      <button
                        type="button"
                        disabled={generateDisabled}
                        data-quick-guide-anchor="generator-submit"
                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[var(--btn-invert-bg)] text-[var(--btn-invert-text)] transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Generate"
                        data-testid="canvas-node-generate-btn"
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={async (event) => {
                          event.stopPropagation();
                          if (generationSubmittingRef.current) return;
                          generationSubmittingRef.current = true;
                          setGenerationSubmitting(true);
                          try {
                            commitPrompt(draftPrompt);
                            await onGenerate?.(
                              draftPrompt,
                              selectedModelValue
                                ? { modelId: selectedModelValue }
                                : undefined,
                            );
                          } finally {
                            generationSubmittingRef.current = false;
                            setGenerationSubmitting(false);
                          }
                        }}
                      >
                        <ArrowUp className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="absolute right-2 top-2 z-10 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--Surface-secondary-background)] text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
                data-testid="canvas-node-generation-input-bar-maximize-button"
                aria-pressed={inputExpanded}
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={toggleInputExpanded}
              >
                <ExpandCornersIcon />
              </button>
            </div>
          </div>
        </div>
        {anchoredPopup}
      </>
    );
  }

  if (isScriptNode) {
    return (
      <>
        <div
          ref={barRef}
          className={`node-floating-ui nodrag nowheel nopan pointer-events-auto absolute -bottom-4 left-1/2 z-20 w-full min-w-[660px] max-w-[660px] -translate-x-1/2 translate-y-full origin-top cursor-default ${inputExpanded ? "workflow-generation-bar-expanded" : ""}`}
          data-canvas-generator-root=""
          data-floating-ui-shell="true"
          data-testid="canvas-node-generation-input-bar"
          style={{
            transform: "translateX(-50%) translateY(100%) scale(1)",
          }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onDoubleClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <div
            data-generator-card=""
            className="relative flex w-full flex-col gap-0 overflow-visible rounded-xl border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[var(--canvas-shadow-panel)]"
          >
            <div className="flex min-h-0 w-full flex-col">
              <div className="flex min-h-0 flex-col gap-2 p-2">
                <div className="flex items-center gap-2" />
                <div className="relative flex gap-1">
                  <div
                    className={`relative flex-1 overflow-hidden rounded-xl p-1 ${inputExpanded ? "min-h-[320px]" : "min-h-20"}`}
                  >
                    {!draftPrompt ? (
                      <p className="pointer-events-none absolute left-1 top-1 m-0 w-full select-none whitespace-pre-wrap text-sm leading-[1.8] text-neutral-500">
                        {LIBTV_SCRIPT_GENERATOR_PROMPT_PLACEHOLDER}
                      </p>
                    ) : null}
                    <textarea
                      ref={promptTextareaRef}
                      aria-label="描述故事片段，为你生成镜头脚本"
                      aria-placeholder={
                        LIBTV_SCRIPT_GENERATOR_PROMPT_PLACEHOLDER
                      }
                      value={draftPrompt}
                      placeholder=""
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={stopWorkflowNodeChromeEvent}
                      onKeyUp={(event) =>
                        updateSlashState(
                          event.currentTarget.value,
                          event.currentTarget.selectionStart ??
                            event.currentTarget.value.length,
                        )
                      }
                      onChange={(event) => {
                        schedulePromptCommit(event.target.value);
                        updateSlashState(
                          event.target.value,
                          event.target.selectionStart ??
                            event.target.value.length,
                        );
                        updateSlashMenuPosition();
                      }}
                      onKeyDown={(event) => stopWorkflowNodeChromeEvent(event)}
                      onSelect={(event) =>
                        updateSlashState(
                          event.currentTarget.value,
                          event.currentTarget.selectionStart ??
                            event.currentTarget.value.length,
                        )
                      }
                      onBlur={() => commitPrompt(draftPrompt)}
                      className={`${inputExpanded ? "h-[320px] max-h-[420px] min-h-[320px]" : "min-h-20 max-h-[100px]"} relative z-10 -mr-1 w-full resize-none overflow-y-auto whitespace-pre-wrap border-0 bg-transparent pr-1.5 text-sm leading-[1.8] text-fg-default outline-none transition-[height] duration-200 ease-out placeholder:text-fg-subtle focus:outline-none focus:ring-0`}
                      rows={1}
                    />
                  </div>
                </div>
                <div className="flex w-full items-center gap-1">
                  <button
                    type="button"
                    className="flex h-8 min-w-0 shrink cursor-pointer items-center justify-between gap-1 rounded-lg bg-transparent px-2 py-1 transition-colors hover:bg-canvas-controls-hover"
                    data-testid="canvas-node-image-model-select"
                    aria-haspopup="listbox"
                    aria-expanded={activePopup === "model"}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePopup("model", event.currentTarget);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-1">
                      <WorkflowModelIcon
                        iconUrl={selectedModelIconUrl}
                        name={modelLabel}
                      />
                      <span
                        className="truncate text-[13px] text-fg-default"
                        title={modelLabel}
                      >
                        {modelsLoading ? "加载模型..." : modelLabel}
                      </span>
                      <WorkflowModelBadges model={selectedModel} />
                    </div>
                    <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
                  </button>
                  <div className="flex-1" />
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={promptTranslating || !draftPrompt.trim()}
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="翻译"
                      title="翻译"
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={(event) => {
                        event.stopPropagation();
                        translateCurrentPrompt();
                      }}
                    >
                      {promptTranslating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <WorkflowVideoTranslateButtonIcon />
                      )}
                    </button>
                    <div className="flex h-8 items-center gap-2 text-fg-muted">
                      <button
                        type="button"
                        disabled={generateDisabled}
                        data-quick-guide-anchor="generator-submit"
                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[var(--btn-invert-bg)] text-[var(--btn-invert-text)] transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Generate"
                        data-testid="canvas-node-generate-btn"
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={async (event) => {
                          event.stopPropagation();
                          if (generationSubmittingRef.current) return;
                          generationSubmittingRef.current = true;
                          setGenerationSubmitting(true);
                          try {
                            commitPrompt(draftPrompt);
                            await onGenerate?.(
                              draftPrompt,
                              selectedModelValue
                                ? { modelId: selectedModelValue }
                                : undefined,
                            );
                          } finally {
                            generationSubmittingRef.current = false;
                            setGenerationSubmitting(false);
                          }
                        }}
                      >
                        <ArrowUp className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="absolute right-2 top-2 z-10 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--Surface-secondary-background)] text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
                data-testid="canvas-node-generation-input-bar-maximize-button"
                aria-pressed={inputExpanded}
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={toggleInputExpanded}
              >
                <ExpandCornersIcon />
              </button>
            </div>
          </div>
        </div>
        {anchoredPopup}
      </>
    );
  }

  return (
    <>
      <div
        ref={barRef}
        className={
          embedded
            ? `workflow-generation-bar nodrag nowheel nopan pointer-events-auto w-full cursor-default ${activePopup ? "z-[1400]" : ""}`
            : `node-float-ui node-float-ui-visible workflow-generation-bar nodrag nopan nowheel pointer-events-auto absolute ${isImageNode || isVideoNode ? "-bottom-4" : "-bottom-2"} left-1/2 ${activePopup ? "z-[1400]" : "z-20"} w-full cursor-default ${generationBarWidthClass}`
        }
        data-canvas-generator-root=""
        data-testid="canvas-node-generation-input-bar"
        style={
          embedded
            ? undefined
            : ({
                "--float-y": "100%",
                "--float-offset": "-12px",
                transformOrigin: "top center",
              } as React.CSSProperties)
        }
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={stopWorkflowNodeChromeEvent}
        onDoubleClick={stopWorkflowNodeChromeEvent}
        onContextMenu={preventWorkflowNodeChromeContextMenu}
      >
        <div className={embedded ? "w-full" : "mt-2 w-full"}>
          <div data-generator-card="" className={generationCardClassName}>
            <>
              {isTextNode ? (
                <div className="absolute right-3 top-3 z-10">
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer p-1 text-fg-muted transition-colors hover:text-fg-default"
                    data-testid="canvas-node-generation-input-bar-maximize-button"
                    aria-pressed={inputExpanded}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={toggleInputExpanded}
                  >
                    <ExpandCornersIcon />
                  </button>
                </div>
              ) : (
                <>
                  {videoMethodUnavailable ? (
                    <div className="mx-2.5 -mt-1 mb-2 rounded-lg border border-amber-300/18 bg-amber-300/[0.08] px-2.5 py-1.5 text-xs leading-5 text-amber-100/86">
                      当前连接的素材不满足该模型任何生成模式，请调整素材或切换模型。
                    </div>
                  ) : null}
                  {showReferenceControls ? (
                    <div
                      className={`flex min-w-0 items-center gap-2 ${isImageNode ? "px-2 pb-0 pt-2" : "px-3 pb-2 pt-3"}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {showGenericReferenceControls ? (
                          <>
                            {isImageNode ? (
                              <div className="flex shrink-0 flex-wrap items-center gap-1 pl-1 pt-1">
                                <button
                                  type="button"
                                  className={imageToolbarPillClass}
                                  aria-label="上传参考图"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setActivePopup(null);
                                    setReferenceMenuOpen((current) => !current);
                                  }}
                                >
                                  <Plus className="size-3.5" />
                                  <span className="whitespace-nowrap text-xs leading-normal">
                                    参考
                                  </span>
                                </button>
                                {!selectedImagePreset ? (
                                  <>
                                    <button
                                      type="button"
                                      className={imageToolbarPillClass}
                                      aria-label="风格"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        togglePopup("style");
                                      }}
                                    >
                                      <StyleReferenceIcon className="size-3.5" />
                                      <span className="whitespace-nowrap text-xs leading-normal">
                                        风格
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`${imageToolbarPillClass} ${focusReferenceImage ? "bg-canvas-controls-active text-fg-default" : ""}`}
                                      aria-label="聚焦"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        closePopups();
                                        commitPrompt(draftPrompt);
                                        onStartFocusPick?.();
                                      }}
                                    >
                                      <FocusModeIcon className="size-3.5" />
                                      <span className="whitespace-nowrap text-xs leading-normal">
                                        {focusReferenceImage
                                          ? "聚焦图"
                                          : "聚焦"}
                                      </span>
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border-muted bg-canvas-controls-hover text-fg-muted transition-all hover:bg-canvas-controls-active hover:text-fg-default"
                                  aria-label="上传参考素材"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (isScriptNode) {
                                      setActivePopup(null);
                                      setReferenceMenuOpen(
                                        (current) => !current,
                                      );
                                    } else {
                                      openLocalReferenceUpload(event);
                                    }
                                  }}
                                >
                                  <Upload className="size-4" />
                                </button>
                                <div className="h-4 w-px shrink-0 bg-border-muted" />
                              </>
                            )}
                            {visibleReferenceEntries.length > 0 ? (
                              <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                                {visibleReferenceEntries.map(
                                  ({ src, index, role, sourceId }) => {
                                    const isStyleReference = role === "style";
                                    const referenceLabel = isStyleReference
                                      ? "风格图"
                                      : "参考图";
                                    return (
                                      <button
                                        key={`${src}-${index}`}
                                        type="button"
                                        className="group/ref relative size-[38px] shrink-0 overflow-hidden rounded-[10px] border border-border-muted bg-canvas-controls-hover"
                                        title={`${referenceLabel} ${index + 1}`}
                                        onPointerDown={
                                          stopWorkflowNodeChromeEvent
                                        }
                                        onMouseDown={
                                          stopWorkflowNodeChromeEvent
                                        }
                                        onClick={stopWorkflowNodeChromeEvent}
                                      >
                                        <img
                                          src={src}
                                          alt=""
                                          draggable={false}
                                          className="h-full w-full object-cover"
                                        />
                                        {isStyleReference ? (
                                          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/58 px-1 py-0.5 text-[9px] font-medium leading-none text-white">
                                            {referenceLabel}
                                          </span>
                                        ) : null}
                                        <span
                                          role="button"
                                          tabIndex={0}
                                          className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-black text-white opacity-0 transition-opacity group-hover/ref:opacity-100"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onReferenceRemoved?.(
                                              index,
                                              sourceId,
                                            );
                                          }}
                                        >
                                          <X className="size-3" />
                                        </span>
                                      </button>
                                    );
                                  },
                                )}
                              </div>
                            ) : !isImageNode ? (
                              <button
                                type="button"
                                className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-canvas-controls-hover text-fg-muted transition-all hover:bg-canvas-controls-active hover:text-fg-default"
                                aria-label="添加参考图"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (isScriptNode) {
                                    setActivePopup(null);
                                    setReferenceMenuOpen((current) => !current);
                                  } else {
                                    openLocalReferenceUpload(event);
                                  }
                                }}
                              >
                                <Plus className="size-4" />
                              </button>
                            ) : null}
                            {isScriptNode &&
                            scriptInputSourceCards.length > 0 ? (
                              <div className="scrollbar-hidden flex min-w-0 items-center gap-1.5 overflow-x-auto">
                                {scriptInputSourceCards.map((item) => (
                                  <div
                                    key={item.id}
                                    className="group/source relative flex h-[38px] max-w-[156px] shrink-0 items-center gap-1.5 overflow-hidden rounded-[10px] border border-border-muted bg-canvas-controls-hover px-2 pr-5 text-left text-fg-muted"
                                    title={item.title}
                                  >
                                    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/24">
                                      {item.kind === "video" &&
                                      item.mediaUrl &&
                                      getWorkflowVideoPosterUrl(
                                        item.mediaUrl,
                                      ) ? (
                                        <img
                                          src={getWorkflowImageRenderUrl(
                                            getWorkflowVideoPosterUrl(
                                              item.mediaUrl,
                                            ),
                                          )}
                                          alt=""
                                          draggable={false}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : item.kind === "audio" ? (
                                        <TapNowNodeIcon
                                          kind="audio"
                                          size={14}
                                          opacity={0.78}
                                        />
                                      ) : (
                                        <TapNowNodeIcon
                                          kind={item.kind}
                                          size={14}
                                          opacity={0.78}
                                        />
                                      )}
                                    </span>
                                    <span className="min-w-0 truncate text-[11px] leading-none">
                                      {item.kind === "video" && item.mediaUrl
                                        ? "参考视频"
                                        : item.title || item.kind}
                                    </span>
                                    <button
                                      type="button"
                                      className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-black text-white opacity-0 transition-opacity group-hover/source:opacity-100"
                                      aria-label="移除上游素材"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onReferenceRemoved?.(-1, item.id);
                                      }}
                                    >
                                      <X className="size-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {referenceMenuOpen &&
                            (isImageNode || isScriptNode) ? (
                              <div
                                className="absolute left-3 top-[56px] z-50 flex w-52 flex-col gap-1 rounded-2xl p-1.5 text-sm text-canvas-controls-text"
                                style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
                              >
                                <button
                                  type="button"
                                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-canvas-controls-hover"
                                  onClick={openLocalReferenceUpload}
                                >
                                  <Upload className="size-4" />
                                  <span>
                                    {isScriptNode
                                      ? "从本地上传素材"
                                      : "从本地上传图片"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="flex cursor-default items-center gap-2 rounded-xl px-2.5 py-2 text-left text-fg-disabled"
                                  disabled
                                >
                                  <TapNowNodeIcon
                                    kind="image"
                                    size={16}
                                    opacity={0.55}
                                  />
                                  <span>从画布选择</span>
                                </button>
                              </div>
                            ) : null}
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept={accept}
                              multiple
                              className="hidden"
                              onChange={uploadReferenceFiles}
                            />
                          </>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 cursor-pointer p-1 text-fg-muted transition-colors hover:text-fg-default"
                        data-testid="canvas-node-generation-input-bar-maximize-button"
                        aria-pressed={inputExpanded}
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={toggleInputExpanded}
                      >
                        <ExpandCornersIcon />
                      </button>
                    </div>
                  ) : (
                    <div className="absolute right-2 top-2 z-10">
                      <button
                        type="button"
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-canvas-controls-hover text-fg-muted transition-colors hover:bg-canvas-controls-active hover:text-fg-default"
                        data-testid="canvas-node-generation-input-bar-maximize-button"
                        aria-pressed={inputExpanded}
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={toggleInputExpanded}
                      >
                        <ExpandCornersIcon />
                      </button>
                    </div>
                  )}
                </>
              )}
              {isVideoNode ? (
                <div className="scrollbar-hidden flex h-[38px] min-w-0 items-center gap-1 overflow-x-auto px-2 pt-2">
                  <button
                    type="button"
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-canvas-controls-hover px-2 text-xs text-fg-muted transition-colors hover:bg-canvas-controls-active hover:text-fg-default"
                    title="参考"
                    onClick={openLocalReferenceUpload}
                  >
                    <Plus className="size-3.5" />
                    <span>参考</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-canvas-controls-hover px-2 text-xs text-fg-muted transition-colors hover:bg-canvas-controls-active hover:text-fg-default"
                    title="特效"
                    onClick={(event) => showDevelopmentNotice(event, "特效")}
                  >
                    <WorkflowVideoEffectsButtonIcon />
                    <span>特效</span>
                  </button>
                  {supportsVideoCharacterLibrary ? (
                    <button
                      type="button"
                      className={`relative inline-flex h-7 shrink-0 items-center gap-1 overflow-hidden rounded-full px-2 text-xs transition-colors ${
                        selectedVideoCharacterAssets.length > 0
                          ? "bg-canvas-controls-active text-fg-default"
                          : "bg-canvas-controls-hover text-fg-muted hover:bg-canvas-controls-active hover:text-fg-default"
                      }`}
                      title={
                        selectedVideoCharacterAssets.length > 0
                          ? `人物库：已选 ${selectedVideoCharacterAssets.length}`
                          : "人物库"
                      }
                      onClick={() => togglePopup("characters")}
                    >
                      {selectedVideoCharacterPreview ? (
                        <>
                          <img
                            src={selectedVideoCharacterPreview}
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 bg-black/58" />
                          <span className="relative text-white">
                            人物库 · {selectedVideoCharacterAssets.length}
                          </span>
                        </>
                      ) : (
                        <>
                          <WorkflowVideoCharacterButtonIcon />
                          <span>人物库</span>
                        </>
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs transition-colors ${videoCameraMotion?.id ? "bg-canvas-controls-active text-fg-default" : "bg-canvas-controls-hover text-fg-muted hover:bg-canvas-controls-active hover:text-fg-default"}`}
                    aria-label="运镜"
                    aria-haspopup="dialog"
                    aria-expanded={activePopup === "motion"}
                    onClick={(event) =>
                      togglePopup("motion", event.currentTarget)
                    }
                  >
                    <WorkflowVideoMotionButtonIcon className="size-3.5" />
                    <span>{videoCameraMotion?.label || "运镜"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={videoUploadAccept}
                    multiple
                    className="hidden"
                    onChange={uploadReferenceFiles}
                  />
                </div>
              ) : null}
              {isVideoNode && visibleVideoReferenceCards.length > 0 ? (
                <div
                  className="scrollbar-hidden flex min-w-0 items-center gap-1.5 overflow-x-auto px-2 pb-1 pt-1"
                  data-testid="canvas-node-video-reference-strip"
                >
                  {visibleVideoReferenceCards.map((card, index) =>
                    renderVideoReferenceCard(card, index),
                  )}
                </div>
              ) : null}
              <div
                className={`relative flex flex-1 ${isImageNode && selectedImagePreset ? "items-start gap-1.5" : "justify-between"} ${isTextNode ? "px-0" : isVideoNode ? `mx-2 min-h-24 ${mentionOpen ? "overflow-visible" : "overflow-hidden"} rounded-xl px-2` : isImageNode ? `mx-2 min-h-20 ${mentionOpen ? "overflow-visible" : "overflow-hidden"} rounded-xl px-2` : "px-3"}`}
                data-testid="canvas-node-prompt-textarea"
                onClick={() => {
                  if (promptInputDisabled) return;
                  promptTextareaRef.current?.focus();
                }}
              >
                {isImageNode && selectedImagePreset ? (
                  <div className="shrink-0 pt-2">
                    <WorkflowImagePresetMentionBadge
                      preset={selectedImagePreset}
                      onOpenPortraitTextureSettings={
                        portraitTexturePresetSelected
                          ? (anchor) => togglePopup("portraitTexture", anchor)
                          : undefined
                      }
                    />
                  </div>
                ) : null}
                {isImageNode && !selectedImagePreset && !draftPrompt ? (
                  <p className="pointer-events-none absolute left-2 top-2 z-0 m-0 select-none whitespace-pre-wrap text-sm leading-[1.8] text-fg-disabled">
                    {promptPlaceholder}
                  </p>
                ) : null}
                <textarea
                  ref={promptTextareaRef}
                  aria-label="描述"
                  value={draftPrompt}
                  placeholder={
                    isImageNode
                      ? ""
                      : isVideoNode
                        ? "描述你想要生成的画面内容，@引用素材"
                        : promptPlaceholder
                  }
                  readOnly={promptInputDisabled}
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={stopWorkflowNodeChromeEvent}
                  onKeyUp={(event) =>
                    updateSlashState(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart ??
                        event.currentTarget.value.length,
                    )
                  }
                  onChange={(event) => {
                    schedulePromptCommit(event.target.value);
                    updateSlashState(
                      event.target.value,
                      event.target.selectionStart ?? event.target.value.length,
                    );
                    updateSlashMenuPosition();
                  }}
                  onKeyDown={(event) => {
                    stopWorkflowNodeChromeEvent(event);
                    if (mentionOpen && filteredMentionOptions.length > 0) {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setMentionIndex((current) => Math.max(0, current - 1));
                        return;
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMentionIndex((current) =>
                          Math.min(
                            filteredMentionOptions.length - 1,
                            current + 1,
                          ),
                        );
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const option = filteredMentionOptions[mentionIndex];
                        if (option) insertWorkflowMention(option);
                        return;
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setMentionOpen(false);
                      }
                    }
                  }}
                  onSelect={(event) =>
                    updateSlashState(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart ??
                        event.currentTarget.value.length,
                    )
                  }
                  onBlur={() => commitPrompt(draftPrompt)}
                  className={`${isVideoNode && !inputExpanded ? "h-24 max-h-24 min-h-24" : compactPromptHeightClass} block appearance-none resize-none overflow-x-hidden overflow-y-auto border-0 bg-transparent text-sm text-fg-default shadow-none transition-[height] duration-200 ease-out [scrollbar-width:none] placeholder:text-fg-subtle focus:outline-none focus:ring-0 [&::-webkit-scrollbar]:hidden ${promptInputDisabled ? "cursor-not-allowed select-none" : ""} ${isTextNode ? "w-full px-3 py-3 pr-10 leading-5" : isVideoNode ? "w-full rounded-xl px-2 pb-2 pt-2 leading-[1.8]" : isImageNode && selectedImagePreset ? "min-w-0 flex-1 -mr-2 px-1 pb-2 pt-2 pr-1.5 leading-[1.8]" : isImageNode ? "relative z-10 -mr-2 w-full px-0 pb-2 pt-2 pr-1.5 leading-[1.8]" : "w-full px-0 pb-2 pt-2 leading-5"}`}
                  rows={1}
                />
                {mentionOpen && filteredMentionOptions.length > 0 ? (
                  <div
                    className="nodrag nopan nowheel absolute left-0 top-0 z-[1300] w-56 overflow-hidden rounded-lg py-1.5 text-canvas-controls-text"
                    style={{
                      ...CANVAS_CONTROLS_MENU_PANEL_STYLE,
                      transform: "translateY(-100%)",
                    }}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={stopWorkflowNodeChromeEvent}
                  >
                    {filteredMentionOptions.slice(0, 10).map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors ${index === mentionIndex ? "bg-canvas-controls-hover text-canvas-controls-text" : "text-canvas-controls-text opacity-80 hover:bg-canvas-controls-hover hover:opacity-100"}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          insertWorkflowMention(item);
                        }}
                      >
                        <WorkflowMediaMentionPreview item={item} />
                        <span className="min-w-0">
                          <span className="block truncate">
                            {item.insertText}
                          </span>
                          <span className="block truncate text-[11px] text-fg-subtle">
                            {item.title}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                className={actionBarClassName}
                data-testid="canvas-node-generation-action-bar"
              >
                <div
                  className={`scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto ${isImageNode ? "pr-1" : "pr-2"}`}
                >
                  {onCancel ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
                        title="退出"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCancel();
                        }}
                      >
                        <X className="size-5" />
                      </button>
                      <div className="h-4 w-px bg-border-muted" />
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={panoramaPresetLocked}
                    className={`${isVideoNode ? "inline-flex h-8 min-w-0 max-w-[240px] shrink-[2] items-center justify-between gap-1 rounded-lg px-2 py-1 text-[13px]" : isImageNode ? "inline-flex h-8 min-w-0 max-w-[180px] shrink-[2] items-center justify-between gap-1 rounded-lg px-2 py-1 text-[13px]" : "inline-flex h-10 max-w-[280px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm"} font-normal text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent`}
                    data-testid="canvas-node-image-model-select"
                    aria-haspopup="listbox"
                    aria-expanded={activePopup === "model"}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (panoramaPresetLocked) return;
                      togglePopup("model", event.currentTarget);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {selectedModelIconUrl ? (
                        <WorkflowModelIcon
                          iconUrl={selectedModelIconUrl}
                          name={modelLabel}
                        />
                      ) : isImageNode ? (
                        <BananaModelIcon />
                      ) : (
                        <SparkleModelIcon />
                      )}
                      <span
                        className="min-w-0 truncate whitespace-nowrap"
                        title={modelLabel}
                      >
                        {modelsLoading ? "加载模型..." : modelLabel}
                      </span>
                      <WorkflowModelBadges model={selectedModel} />
                    </span>
                    {isImageNode || isVideoNode ? (
                      <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
                    ) : null}
                  </button>
                  {!isTextNode ? (
                    <>
                      {isVideoNode && methodOptions.length > 0 ? (
                        <button
                          type="button"
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-normal text-fg-default transition-colors hover:bg-canvas-controls-hover"
                          aria-haspopup="listbox"
                          aria-expanded={activePopup === "mode"}
                          onClick={(event) =>
                            togglePopup("mode", event.currentTarget)
                          }
                        >
                          <WorkflowVideoMethodIcon
                            value={selectedVideoRouteMode}
                          />
                          <span className="whitespace-nowrap">
                            {selectedVideoMethodLabel}
                          </span>
                          <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
                        </button>
                      ) : null}
                      {isImageNode ? (
                        <div className="h-3.5 w-px shrink-0 bg-border-muted" />
                      ) : !isVideoNode ? (
                        <div className="h-4 w-px bg-border-muted" />
                      ) : null}
                      <button
                        type="button"
                        className={`${isVideoNode || isImageNode ? "inline-flex h-8 min-w-0 shrink items-center justify-between gap-1 rounded-lg bg-transparent px-2 py-1 text-[13px]" : "inline-flex h-10 min-w-[124px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm"} font-normal text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent`}
                        onClick={(event) => {
                          isImageNode || isVideoNode
                            ? togglePopup("ratio", event.currentTarget)
                            : closePopups();
                        }}
                      >
                        {isImageNode ? (
                          <ImageGeneratorSettingButtonIcon />
                        ) : (
                          <AspectRatioGlyph value={selectedAspectRatio} />
                        )}
                        <span
                          className="truncate whitespace-nowrap"
                          title={settingLabel}
                        >
                          {settingLabel}
                        </span>
                        {isVideoNode ? (
                          selectedGenerateAudio ? (
                            <Volume2 className="size-3.5 shrink-0" />
                          ) : (
                            <VolumeX className="size-3.5 shrink-0" />
                          )
                        ) : null}
                        <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
                      </button>
                      {isImageNode ? (
                        <div className="h-3.5 w-px shrink-0 bg-border-muted" />
                      ) : null}
                    </>
                  ) : null}
                  {isImageNode ? (
                    <>
                      <button
                        type="button"
                        aria-label="预设"
                        title={selectedImagePreset?.label || "预设"}
                        className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-default transition-colors hover:bg-canvas-controls-hover"
                        onClick={(event) =>
                          togglePopup(
                            portraitTexturePresetSelected
                              ? "portraitTexture"
                              : "presets",
                            event.currentTarget,
                          )
                        }
                      >
                        <span
                          role="button"
                          tabIndex={-1}
                          className="flex size-6 items-center justify-center rounded-lg"
                        >
                          <PresetToggleIcon
                            className="size-4 shrink-0"
                            active={Boolean(selectedImagePreset)}
                          />
                        </span>
                        {selectedImagePreset ? (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute right-[3px] top-[3px] size-1.5 rounded-full bg-[#5DDCFF]"
                          />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-transparent text-fg-default transition-colors hover:bg-canvas-controls-hover"
                        aria-label="摄像机"
                        title="摄像机"
                        aria-haspopup="dialog"
                        aria-expanded={activePopup === "camera"}
                        onClick={(event) =>
                          togglePopup("camera", event.currentTarget)
                        }
                      >
                        <ImageGeneratorCameraButtonIcon
                          active={cameraControlEnabled}
                        />
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="relative flex shrink-0 items-center gap-1">
                  {isVideoNode ? (
                    <>
                      {seedancePromptOptimizeAvailable ? (
                        <button
                          type="button"
                          disabled={promptOptimizing || !draftPrompt.trim()}
                          className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-45 ${
                            promptOptimizedResult.trim() && !promptOptimizing
                              ? "text-[#31C48D]"
                              : "text-fg-default"
                          }`}
                          aria-label="提示词优化"
                          title="提示词优化"
                          onPointerDown={stopWorkflowNodeChromeEvent}
                          onMouseDown={stopWorkflowNodeChromeEvent}
                          onClick={handlePromptOptimizeButtonClick}
                        >
                          {promptOptimizing ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <WorkflowVideoPromptOptimizeButtonIcon />
                          )}
                          {promptOptimizedResult.trim() ? (
                            <span className="absolute right-0.5 top-[6px] size-2 rounded-full bg-[#31C48D]" />
                          ) : null}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={promptTranslating || !draftPrompt.trim()}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="翻译提示词"
                        title="翻译提示词"
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={(event) => {
                          event.stopPropagation();
                          translateCurrentPrompt();
                        }}
                      >
                        {promptTranslating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <WorkflowVideoTranslateButtonIcon />
                        )}
                      </button>
                      <button
                        type="button"
                        className={`mx-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-default transition-colors hover:bg-canvas-controls-hover ${advancedOpen ? "bg-canvas-controls-active" : ""}`}
                        aria-label="高级设置"
                        title="高级设置"
                        data-testid="canvas-node-advanced-settings-toggle"
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={(event) => {
                          event.stopPropagation();
                          closePopups();
                          setAdvancedOpen((current) => !current);
                        }}
                      >
                        <WorkflowVideoAdvancedButtonIcon />
                      </button>
                    </>
                  ) : (
                    <>
                      {isImageNode ? (
                        <>
                          <button
                            type="button"
                            disabled={promptTranslating || !draftPrompt.trim()}
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-45"
                            aria-label="翻译提示词"
                            title="翻译提示词"
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={(event) => {
                              event.stopPropagation();
                              translateCurrentPrompt();
                            }}
                          >
                            {promptTranslating ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <WorkflowVideoTranslateButtonIcon />
                            )}
                          </button>
                          <button
                            type="button"
                            className={`mx-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-default transition-colors hover:bg-canvas-controls-hover ${advancedOpen ? "bg-canvas-controls-active" : ""}`}
                            aria-label="高级设置"
                            title="高级设置"
                            data-testid="canvas-node-advanced-settings-toggle"
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={(event) => {
                              event.stopPropagation();
                              closePopups();
                              setAdvancedOpen((current) => !current);
                            }}
                          >
                            <WorkflowVideoAdvancedButtonIcon />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={promptInputDisabled}
                            className={`flex shrink-0 items-center justify-center rounded-lg text-fg-default transition-colors hover:bg-canvas-controls-hover ${isVideoNode || isImageNode ? "size-8" : "px-2.5 py-2.5"} ${listening ? "bg-canvas-controls-active text-fg-default" : ""}`}
                            aria-label={listening ? "停止语音输入" : "语音输入"}
                            title={
                              speechStatus ||
                              (listening ? "正在听写" : "语音输入")
                            }
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={toggleSpeechInput}
                          >
                            {isImageNode ? (
                              <Mic className="size-4" />
                            ) : (
                              <MicrophoneIcon />
                            )}
                          </button>
                          {speechStatus ? (
                            <div
                              className="pointer-events-none absolute bottom-full right-0 mb-2 max-w-72 rounded-lg px-2.5 py-1.5 text-xs text-canvas-controls-text opacity-80"
                              style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
                            >
                              {speechStatus}
                            </div>
                          ) : null}
                          {!isVideoNode ? (
                            <div className="h-4 w-px shrink-0 bg-border-muted" />
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                  {hasSelectionCount ? (
                    <div className="flex h-8 items-center whitespace-nowrap px-2 text-sm text-fg-muted">
                      已选 {safeSelectedItemCount}/{safeTotalItemCount}
                    </div>
                  ) : !isImageNode && !isVideoNode ? (
                    <div className="relative">
                      <button
                        type="button"
                        className={`${isVideoNode ? "flex h-8 items-center gap-1 rounded-lg px-2 text-[13px]" : "flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"} font-medium text-fg-default transition-all hover:bg-canvas-controls-hover`}
                        onClick={(event) =>
                          isImageNode || isVideoNode
                            ? togglePopup("count", event.currentTarget)
                            : closePopups()
                        }
                        aria-label={`Generate ${selectedCountNumber} variations`}
                        aria-haspopup="dialog"
                        aria-expanded={activePopup === "count"}
                      >
                        <span>
                          {isVideoNode || isImageNode
                            ? selectedCountLabel
                            : `${selectedCountNumber}×`}
                        </span>
                        {isVideoNode || isImageNode ? (
                          <ChevronDown
                            className={
                              isImageNode
                                ? "size-[10px] text-fg-subtle"
                                : "size-3"
                            }
                          />
                        ) : null}
                      </button>
                    </div>
                  ) : null}
                  <div
                    className={
                      isVideoNode || isImageNode
                        ? "flex h-8 items-center gap-2 text-fg-muted"
                        : "flex items-center gap-1 rounded-full border border-white/10 p-1"
                    }
                    style={
                      isVideoNode || isImageNode
                        ? undefined
                        : {
                            backdropFilter: "blur(10px)",
                            background:
                              "radial-gradient(94.74% 157.5% at 50% 21.25%, rgb(26, 26, 26) 0%, rgb(101, 103, 102) 100%)",
                          }
                    }
                  >
                    <button
                      type="button"
                      disabled={generateDisabled}
                      className={`${isVideoNode || isImageNode ? "flex size-8 rounded-xl bg-[var(--btn-invert-bg)] text-[var(--btn-invert-text)] hover:brightness-110" : "flex h-[26px] w-[26px] rounded-full bg-white text-black hover:bg-white/70"} cursor-pointer items-center justify-center text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50`}
                      aria-label="Generate"
                      data-testid="canvas-node-generate-btn"
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={async (event) => {
                        event.stopPropagation();
                        if (
                          generationSubmittingRef.current ||
                          generationSubmitting
                        )
                          return;
                        generationSubmittingRef.current = true;
                        setGenerationSubmitting(true);
                        try {
                          if (videoMethodUnavailable) {
                            message.warning(
                              "当前连接的素材不满足该模型任何生成模式，请调整素材或切换模型。",
                            );
                            return;
                          }
                          commitPrompt(draftPrompt);
                          const submitSettings: WorkflowGenerationSubmitSettings =
                            {};
                          if (isImageNode || isVideoNode) {
                            if (selectedModelValue)
                              submitSettings.modelId = selectedModelValue;
                            if (
                              (isVideoNode && aspectOptions.length > 0) ||
                              (isImageNode && imageModelSupportsAspectRatio)
                            )
                              submitSettings.aspectRatio = selectedAspectRatio;
                            submitSettings.enableWebSearch =
                              selectedWebSearchEnabled;
                            if (isImageNode) {
                              submitSettings.workflowEndpointMethod =
                                selectedImageEndpointMethod || undefined;
                              submitSettings.selectedOptionId =
                                selectedImagePreset?.id || "custom";
                              if (portraitTexturePresetSelected) {
                                submitSettings.workflowPortraitTextureSettings =
                                  resolvePortraitTextureSettings(
                                    workflowPortraitTextureSettings,
                                  );
                              }
                              if (panoramaPresetLocked) {
                                submitSettings.modelId =
                                  resolveWorkflowGptImage2ModelValue(
                                    modelOptions,
                                  );
                                submitSettings.workflowEndpointMethod =
                                  undefined;
                                submitSettings.aspectRatio = "2:1";
                                if (imageModelSupportsImageSize)
                                  submitSettings.imageSize = selectedImageSize;
                              } else if (imageModelSupportsImageSize) {
                                submitSettings.imageSize = selectedImageSize;
                              }
                              submitSettings.stylePreset = selectedImagePreset
                                ? undefined
                                : selectedStylePreset === "自动"
                                  ? undefined
                                  : selectedStylePreset;
                              submitSettings.cameraControl =
                                cameraControlEnabled
                                  ? selectedCameraControl
                                  : undefined;
                            }
                            if (isVideoNode) {
                              if (sizeOptions.length > 0)
                                submitSettings.videoResolution =
                                  selectedVideoResolution;
                              if (durationOptions.length > 0)
                                submitSettings.videoDuration =
                                  selectedVideoDuration;
                              submitSettings.videoMethod = selectedVideoMethod;
                              submitSettings.generateAudio =
                                selectedGenerateAudio;
                              submitSettings.videoCameraMotion =
                                videoCameraMotion;
                              submitSettings.videoCharacterAssets =
                                selectedVideoCharacterAssets;
                            }
                            submitSettings.workflowExtraParameters =
                              Object.keys(resolvedWorkflowExtraParameters || {})
                                .length > 0
                                ? { ...(resolvedWorkflowExtraParameters || {}) }
                                : undefined;
                            if (!hasSelectionCount && countOptions.length > 0)
                              submitSettings.generationCount =
                                selectedCountNumber;
                            onGenerationSettingsChange?.(submitSettings);
                            if (isVideoNode)
                              onRequestGenerationFrame?.(selectedAspectRatio);
                          }
                          closePopups();
                          await onGenerate?.(draftPrompt, submitSettings);
                        } finally {
                          generationSubmittingRef.current = false;
                          setGenerationSubmitting(false);
                        }
                      }}
                    >
                      <ArrowUp
                        className={
                          isVideoNode || isImageNode ? "size-3" : "size-4"
                        }
                      />
                    </button>
                  </div>
                </div>
              </div>
              {advancedOpen && (isImageNode || isVideoNode) ? (
                <div
                  className="nodrag nopan nowheel overflow-visible border-t border-[var(--canvas-node-border)] bg-[var(--workflow-node-control-background)] p-4 text-sm text-fg-default"
                  data-testid="canvas-node-advanced-settings-panel"
                >
                  {supportsWebSearch ? (
                    <div className="flex items-center justify-between">
                      <span>联网搜索</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={selectedWebSearchEnabled}
                        className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${selectedWebSearchEnabled ? "bg-[var(--btn-invert-bg)] text-[var(--btn-invert-text)]" : "bg-canvas-controls-active text-fg-default"}`}
                        onClick={() =>
                          onGenerationSettingsChange?.({
                            enableWebSearch: !selectedWebSearchEnabled,
                          })
                        }
                      >
                        <span
                          className={`block size-4 rounded-full shadow-lg transition-transform ${selectedWebSearchEnabled ? "translate-x-4 bg-[var(--btn-invert-text)]" : "translate-x-0.5 bg-fg-muted"}`}
                        />
                      </button>
                    </div>
                  ) : null}
                  {hasExtraParameters ? (
                    <WorkflowExtraParametersPanel
                      definitions={visibleExtraParameterDefinitions}
                      values={workflowExtraParameters}
                      context={extraParameterContext}
                      onChange={(patch) =>
                        commitGenerationSettings(
                          {
                            workflowExtraParameters: {
                              ...(workflowExtraParameters || {}),
                              ...patch,
                            },
                          },
                          { keepOpen: true },
                        )
                      }
                    />
                  ) : null}
                  {!supportsWebSearch && !hasExtraParameters ? (
                    <div className="text-xs text-fg-subtle">
                      当前模型没有更多参数
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          </div>
        </div>
      </div>
      {anchoredPopup}
      {activePopup === "characters" &&
      isVideoNode &&
      supportsVideoCharacterLibrary &&
      typeof document !== "undefined"
        ? createPortal(
            <VideoCharacterAssetLibraryPopup
              projectId={projectId}
              modelId={selectedModelValue}
              selectedAssets={selectedVideoCharacterAssets}
              onClose={closePopups}
              onConfirm={(assets) =>
                commitGenerationSettings({ videoCharacterAssets: assets })
              }
            />,
            document.body,
          )
        : null}
      {activePopup === "style" && isImageNode && typeof document !== "undefined"
        ? createPortal(
            <WorkflowStyleGalleryPopup
              selected={selectedStylePreset}
              onClose={closePopups}
              onSelect={commitStyleGalleryItem}
            />,
            document.body,
          )
        : null}
      {promptOptimizeSuccessNoticeVisible && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 top-5 z-[calc(var(--z-overlay,1400)+3)] flex justify-center px-4">
              <div className="pointer-events-auto flex min-h-11 max-w-[min(720px,calc(100vw-32px))] items-center gap-3 rounded-xl border border-[#8BE2BC] bg-[#E9FFF3] px-4 py-3 text-[13px] font-medium text-[#106B44] shadow-[0_18px_48px_rgba(16,107,68,0.18)]">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#31C48D] text-white">
                  <Check className="size-3" />
                </span>
                <span>提示词已经生成，可以再次点击提示词优化按钮查看</span>
                <button
                  type="button"
                  aria-label="关闭提示"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#106B44]/72 transition-colors hover:bg-[#31C48D]/10 hover:text-[#106B44]"
                  onClick={hidePromptOptimizeSuccessNotice}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      {promptOptimizeDialogOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[calc(var(--z-overlay,1400)+2)] flex items-center justify-center bg-black/56 backdrop-blur-[8px]"
              role="presentation"
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={closePromptOptimizeDialog}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-label="优化后的提示词"
                className="flex h-[400px] w-[640px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-xl border border-white/10 bg-[#292929] p-4 text-[#F3F3F3] shadow-[0_24px_64px_rgba(0,0,0,0.36)]"
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={stopWorkflowNodeChromeEvent}
              >
                <header className="flex h-6 shrink-0 items-center justify-between">
                  <h2 className="text-sm font-medium text-[#F5F5F5]">
                    优化后的提示词
                  </h2>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="复制优化后的提示词"
                      className="flex size-6 items-center justify-center rounded-lg text-white/88 transition-colors hover:bg-white/8 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={copyOptimizedPrompt}
                    >
                      {promptOptimizeCopied ? (
                        <Check className="size-3.5 text-[#31C48D]" />
                      ) : (
                        <WorkflowPromptOptimizeDialogCopyIcon className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="关闭"
                      className="flex size-6 items-center justify-center rounded-lg text-white/78 transition-colors hover:bg-white/8 hover:text-white"
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onMouseDown={stopWorkflowNodeChromeEvent}
                      onClick={closePromptOptimizeDialog}
                    >
                      <WorkflowPromptOptimizeDialogCloseIcon className="size-3" />
                    </button>
                  </div>
                </header>
                <div className="flex min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#454545] p-3 text-[13px] leading-8 text-[#F0F0F0]">
                  {promptOptimizedResult}
                </div>
                <footer className="flex h-8 shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    className="flex h-8 items-center justify-center gap-1 rounded-lg px-3 text-[13px] text-white/72 transition-colors hover:bg-white/6 hover:text-white disabled:pointer-events-none disabled:opacity-50"
                    disabled={promptOptimizing || !draftPrompt.trim()}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={() => {
                      setPromptOptimizedResult("");
                      setPromptOptimizeDialogOpen(false);
                      optimizeCurrentPrompt();
                    }}
                  >
                    <WorkflowPromptOptimizeDialogRefreshIcon className="size-3.5" />
                    重新生成
                  </button>
                  <button
                    type="button"
                    className="flex h-8 items-center justify-center rounded-lg bg-white px-3 text-[13px] text-[#151515] transition-opacity hover:opacity-92 disabled:pointer-events-none disabled:opacity-50"
                    disabled={!promptOptimizedResult.trim()}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={fillOptimizedPromptIntoInput}
                  >
                    填充到输入框内
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
      {slashOpen &&
      slashPresetMatches.length > 0 &&
      slashMenuPosition &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="nodrag nopan nowheel pointer-events-auto fixed z-[1300]"
              style={{
                left: slashMenuPosition.left,
                top: slashMenuPosition.top,
                width: slashMenuPosition.width,
                transform:
                  slashMenuPosition.placement === "top"
                    ? "translateY(-100%)"
                    : "none",
              }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
              onContextMenu={preventWorkflowNodeChromeContextMenu}
            >
              <div
                className="w-full overflow-y-auto rounded-lg border border-white/[0.08] bg-[#202024] py-2 shadow-[0_18px_44px_rgba(0,0,0,0.48)]"
                style={{ maxHeight: slashMenuPosition.maxHeight }}
              >
                {slashPresetMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/88 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={false}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectSlashPreset(item);
                    }}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
                      <Sparkles size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="block truncate text-xs text-white/40">
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

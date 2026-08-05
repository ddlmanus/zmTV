import { normalizeLibTvStoryboardScriptResult, type LibTvScriptV2AssetKind } from "@/workflow/ideart/lib/libtv/script"
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow"

import { CODEX_CANVAS_CONTRACT_VERSION } from "./codex-canvas-response"
import { CODEX_WORKFLOW_STAGE_ORDER } from "./codex-node-placement"

const CODEX_CANVAS_NODE_DATA_FIELDS = new Set([
    "title",
    "content",
    "prompt",
    "workflowInternalPrompt",
    "modelId",
    "workflowExtraParameters",
    "aspectRatio",
    "imageSize",
    "stylePreset",
    "videoMethod",
    "videoDuration",
    "videoResolution",
    "videoMethodUserSelected",
    "videoCameraMotion",
    "cameraControl",
    "workflowPortraitTextureSettings",
    "generateAudio",
    "generationCount",
    "selectedOptionId",
    "enableWebSearch",
    "mediaUrl",
    "mediaRole",
    "componentType",
    "scriptResult",
    "scriptViewMode",
    "scriptV2ActiveStep",
    "scriptV2AssetsByKind",
    "scriptV2AssetGroupId",
    "workflowScriptV2AssetKind",
    "workflowScriptV2AssetId",
    "workflowScriptV2AssetModelId",
    "workflowScriptV2AssetGroupSourceId",
    "workflowAssetStage",
    "workflowAssetPersonaId",
    "workflowAssetReviewStatus",
    "workflowSceneCleanPlate",
    "workflowSkillId",
    "workflowSkillStage",
    "workflowSkillStageStatus",
    "workflowSkillPersonaIds",
    "playlistBackgroundAudioVolume",
    "playlistVoiceoverVolume",
    "playlistSubtitles",
    "workflowAudioRole",
    "playlistItems",
    "playlistTrimStart",
    "playlistTrimEnd",
    "workflowPlaylistSourceNodeId",
    "workflowSubtitleTimeline",
    "workflowCodexTaskId",
    "workflowCodexLayoutAnchorX",
    "workflowCodexLayoutAnchorY",
    "workflowCodexLayoutIndex",
    "workflowCodexLayoutStage",
    "workflowCodexLayoutRow",
    "workflowStoryboardSourceNodeId",
    "workflowStoryboardSourceRowIndex",
    "workflowStoryboardDuration",
    "workflowStoryboardPending",
    "workflowStoryboardRowIndexes",
    "referenceImageNodeIds",
    "referenceImageRoles",
    "groupNodeIds",
])

export function sanitizeCodexCanvasNodeData(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    const sanitized = Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => CODEX_CANVAS_NODE_DATA_FIELDS.has(key)))
    if ("scriptResult" in sanitized) {
        sanitized.scriptResult = normalizeLibTvStoryboardScriptResult(sanitized.scriptResult)
    }
    if ("scriptV2ActiveStep" in sanitized) {
        const step = String(sanitized.scriptV2ActiveStep || "").trim()
        if (step !== "confirm-shots" && step !== "prepare-assets" && step !== "compose-prompts") delete sanitized.scriptV2ActiveStep
    }
    if ("scriptV2AssetsByKind" in sanitized) {
        const assets = sanitized.scriptV2AssetsByKind && typeof sanitized.scriptV2AssetsByKind === "object" && !Array.isArray(sanitized.scriptV2AssetsByKind)
            ? sanitized.scriptV2AssetsByKind as Record<string, unknown>
            : {}
        sanitized.scriptV2AssetsByKind = Object.fromEntries((["角色", "场景", "道具"] as LibTvScriptV2AssetKind[])
            .map((kind) => [kind, Array.isArray(assets[kind]) ? assets[kind] : []]))
    }
    if ("workflowAudioRole" in sanitized) {
        const role = String(sanitized.workflowAudioRole || "").trim()
        if (role !== "voiceover" && role !== "background_music") delete sanitized.workflowAudioRole
    }
    if ("workflowAssetStage" in sanitized) {
        sanitized.workflowAssetStage = String(sanitized.workflowAssetStage || "").trim().slice(0, 80)
        if (!sanitized.workflowAssetStage) delete sanitized.workflowAssetStage
    }
    if ("workflowAssetPersonaId" in sanitized) {
        sanitized.workflowAssetPersonaId = String(sanitized.workflowAssetPersonaId || "").trim().slice(0, 120)
        if (!sanitized.workflowAssetPersonaId) delete sanitized.workflowAssetPersonaId
    }
    if ("workflowAssetReviewStatus" in sanitized) {
        const reviewStatus = String(sanitized.workflowAssetReviewStatus || "").trim().toLowerCase()
        if (reviewStatus !== "pending" && reviewStatus !== "approved" && reviewStatus !== "rejected") delete sanitized.workflowAssetReviewStatus
        else sanitized.workflowAssetReviewStatus = reviewStatus
    }
    if ("workflowSceneCleanPlate" in sanitized) {
        sanitized.workflowSceneCleanPlate = sanitized.workflowSceneCleanPlate === true
    }
    for (const skillKey of ["workflowSkillId", "workflowSkillStage"] as const) {
        if (!(skillKey in sanitized)) continue
        const value = String(sanitized[skillKey] || "").trim().slice(0, 120)
        if (value) sanitized[skillKey] = value
        else delete sanitized[skillKey]
    }
    if ("workflowSkillStageStatus" in sanitized) {
        const status = String(sanitized.workflowSkillStageStatus || "").trim().toLowerCase()
        if (status === "draft" || status === "completed") sanitized.workflowSkillStageStatus = status
        else delete sanitized.workflowSkillStageStatus
    }
    if ("workflowSkillPersonaIds" in sanitized) {
        sanitized.workflowSkillPersonaIds = Array.isArray(sanitized.workflowSkillPersonaIds)
            ? Array.from(new Set(sanitized.workflowSkillPersonaIds
                .map((item) => String(item || "").trim().slice(0, 120))
                .filter(Boolean))).slice(0, 200)
            : []
    }
    for (const volumeKey of ["playlistBackgroundAudioVolume", "playlistVoiceoverVolume"] as const) {
        if (!(volumeKey in sanitized)) continue
        const volume = Number(sanitized[volumeKey])
        if (!Number.isFinite(volume)) delete sanitized[volumeKey]
        else sanitized[volumeKey] = Math.max(0, Math.min(volumeKey === "playlistVoiceoverVolume" ? 2 : 1, volume))
    }
    if ("playlistSubtitles" in sanitized) {
        sanitized.playlistSubtitles = String(sanitized.playlistSubtitles || "").slice(0, 200_000)
    }
    if ("playlistItems" in sanitized) {
        sanitized.playlistItems = (Array.isArray(sanitized.playlistItems) ? sanitized.playlistItems : [])
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
            .map((item) => ({
                id: String(item.id || "").trim() || undefined,
                nodeId: String(item.nodeId || "").trim() || undefined,
                title: String(item.title || "").trim() || undefined,
                mediaUrl: String(item.mediaUrl || "").trim(),
                thumbnailUrl: String(item.thumbnailUrl || "").trim() || undefined,
                duration: Number.isFinite(Number(item.duration)) && Number(item.duration) > 0 ? Number(item.duration) : undefined,
                trimStart: Number.isFinite(Number(item.trimStart)) && Number(item.trimStart) >= 0 ? Number(item.trimStart) : undefined,
                trimEnd: Number.isFinite(Number(item.trimEnd)) && Number(item.trimEnd) > 0 ? Number(item.trimEnd) : undefined,
            }))
            .filter((item) => item.nodeId || item.mediaUrl)
            .slice(0, 40)
    }
    if ("workflowSubtitleTimeline" in sanitized) {
        sanitized.workflowSubtitleTimeline = (Array.isArray(sanitized.workflowSubtitleTimeline) ? sanitized.workflowSubtitleTimeline : [])
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
            .map((item) => ({
                text: String(item.text || "").trim().slice(0, 2_000),
                startTime: Math.max(0, Number(item.startTime) || 0),
                endTime: Math.max(0, Number(item.endTime) || 0),
                shotNumber: String(item.shotNumber || "").trim().slice(0, 80) || undefined,
                speaker: String(item.speaker || "").trim().slice(0, 120) || undefined,
                sourceStartTime: String(item.sourceStartTime || "").trim().slice(0, 80) || undefined,
                sourceEndTime: String(item.sourceEndTime || "").trim().slice(0, 80) || undefined,
            }))
            .filter((item) => item.text && item.endTime > item.startTime)
            .slice(0, 240)
    }
    if ("workflowCodexLayoutStage" in sanitized) {
        const stage = String(sanitized.workflowCodexLayoutStage || "").trim()
        if (!CODEX_WORKFLOW_STAGE_ORDER.includes(stage as (typeof CODEX_WORKFLOW_STAGE_ORDER)[number])) delete sanitized.workflowCodexLayoutStage
    }
    for (const numericKey of ["workflowCodexLayoutAnchorX", "workflowCodexLayoutAnchorY", "workflowCodexLayoutIndex", "workflowCodexLayoutRow"] as const) {
        if (!(numericKey in sanitized)) continue
        const numericValue = Number(sanitized[numericKey])
        if (!Number.isFinite(numericValue)) delete sanitized[numericKey]
        else sanitized[numericKey] = numericKey === "workflowCodexLayoutIndex" || numericKey === "workflowCodexLayoutRow"
            ? Math.max(0, Math.round(numericValue))
            : numericValue
    }
    return sanitized
}

function codexCanvasNodeContracts() {
    const commonGeneratorFields = [
        "prompt",
        "workflowInternalPrompt",
        "modelId",
        "workflowExtraParameters",
        "generationCount",
        "enableWebSearch",
    ]
    return {
        text: {
            roles: ["ordinary text editor", "text generator"],
            discriminator: "data.componentType=text-editor is an editor; otherwise run uses the native text generator",
            editableFields: ["title", "content", "prompt", "modelId", "workflowExtraParameters", "enableWebSearch", "workflowSkillId", "workflowSkillStage", "workflowSkillStageStatus", "workflowSkillPersonaIds"],
            acceptsIncoming: ["text", "image", "video"],
            output: "generated markdown remains in data.content",
        },
        image: {
            roles: ["ordinary image asset", "image generator", "storyboard image"],
            discriminator: "data.mediaRole=ordinary is an asset; mediaRole=generator with componentType=image-generator is a native generator; workflowStoryboardSourceNodeId plus workflowStoryboardSourceRowIndex identifies a storyboard shot generator",
            editableFields: [...commonGeneratorFields, "mediaUrl", "mediaRole", "componentType", "aspectRatio", "imageSize", "stylePreset", "cameraControl", "referenceImageNodeIds", "referenceImageRoles", "workflowStoryboardSourceNodeId", "workflowStoryboardSourceRowIndex", "workflowAssetStage", "workflowAssetPersonaId", "workflowAssetReviewStatus", "workflowSceneCleanPlate", "workflowScriptV2AssetKind", "workflowScriptV2AssetId", "workflowScriptV2AssetModelId", "workflowSkillId", "workflowSkillStage"],
            acceptsIncoming: ["image", "video", "text"],
            nativeRun: "the same image-generator send action performs billing preflight, supplier routing, task polling and durable OSS persistence",
        },
        video: {
            roles: ["ordinary video asset", "video generator", "storyboard video"],
            discriminator: "data.mediaRole=ordinary is an asset; mediaRole=generator is a generator",
            editableFields: [...commonGeneratorFields, "mediaUrl", "mediaRole", "componentType", "aspectRatio", "videoMethod", "videoDuration", "videoResolution", "generateAudio", "videoCameraMotion", "workflowSubtitleTimeline"],
            acceptsIncoming: ["image", "video", "audio", "text"],
            nativeRun: "the native video send action resolves the exact model contract, requires generateAudio=true for Codex production, then performs billing, dispatch and polling",
        },
        audio: {
            roles: ["ordinary audio asset", "audio generator"],
            discriminator: "componentType=audio-generator is executable; an audio node with mediaUrl is reusable material",
            editableFields: [...commonGeneratorFields, "mediaUrl", "componentType", "workflowAudioRole"],
            acceptsIncoming: ["text", "audio", "video"],
            nativeRun: "uses the native audio generation route and stores the durable result on the same node",
        },
        script: {
            roles: ["script generator", "storyboard script workspace"],
            editableFields: ["title", "prompt", "modelId", "selectedOptionId", "scriptResult", "scriptViewMode"],
            acceptsIncoming: ["text", "image", "video"],
            output: "data.scriptResult follows storyboardWorkflow.scriptResultSchema",
            nativeRun: "generates and normalizes the structured script result; use storyboard compound operations for downstream nodes",
        },
        "script-v2": {
            roles: ["three-stage storyboard script workspace"],
            stages: ["confirm-shots", "prepare-assets", "compose-prompts"],
            editableFields: ["title", "prompt", "modelId", "selectedOptionId", "scriptResult", "scriptViewMode", "scriptV2ActiveStep", "scriptV2AssetsByKind", "workflowSkillId", "workflowSkillStage", "workflowSkillStageStatus"],
            acceptsIncoming: ["text", "image", "video", "character asset image", "scene asset image", "prop asset image"],
            nativeRun: "run exactly one script-v2 with scriptV2Stage=confirm-shots first, then run the same node with scriptV2Stage=prepare-assets; asset import and storyboard generation use native compound operations",
        },
        playlist: {
            roles: ["final editing, exceptional music correction, subtitle verification and export tool"],
            acceptsIncoming: ["native-audio video", "optional replacement music", "optional voiceover correction"],
            editableFields: ["playlistItems order and per-item trimStart/trimEnd", "playlistTrimStart", "playlistTrimEnd", "playlistBackgroundAudioVolume", "playlistVoiceoverVolume", "playlistSubtitles"],
            output: "data.playlistItems references existing video nodes; completion requires data.playlistExportUrl plus one outgoing ordinary video node whose data.workflowPlaylistSourceNodeId matches this playlist",
            nativeRun: "run exports through the native compositor and creates one connected output video; post-production must not be the default way to add the primary soundtrack",
        },
        threed: {
            roles: ["3D asset or 3D generator"],
            editableFields: [...commonGeneratorFields, "mediaUrl", "componentType"],
            acceptsIncoming: ["image", "text"],
            nativeRun: "uses the native 3D generator when configured as a generator",
        },
        "director-console-3d": {
            roles: ["interactive director stage"],
            acceptsIncoming: ["image", "video", "threed"],
            nativeRun: "interactive capture and export remain controlled by the director console UI",
        },
        group: {
            roles: ["layout group", "storyboard image group", "storyboard video group"],
            editableFields: ["title", "groupNodeIds", "workflowStoryboardSourceNodeId", "workflowStoryboardRowIndexes"],
            output: "data.groupNodeIds identifies members; a storyboard group receives one script-group edge and one asset-group edge while its shot generators receive only the matched per-row asset edges",
        },
    }
}

function codexCanvasStoryboardWorkflowContract() {
    return {
        scriptResultSchema: {
            required: ["title", "summary", "sourceScript", "userPrompt", "selectedOptionId", "rows", "generatedAt"],
            assetCollections: ["characterProfiles", "characterAssets", "sceneProfiles", "propProfiles", "reviewRecords"],
            row: {
                required: ["shotNumber", "startTime", "endTime", "duration", "visualDescription", "character1", "characterDescription1", "characterImage1", "character2", "characterDescription2", "characterImage2", "referenceImage", "shotType", "characterAction", "emotion", "sceneTags", "lightingAtmosphere", "musicRhythm", "voice", "soundEffect", "dialogue", "subtitleText", "subtitleStartTime", "subtitleEndTime", "storyboardPrompt", "motionPrompt"],
                matchingKeys: ["characters", "characterKeys", "characterAssetId1", "characterPersonaKey1", "characterAssetId2", "characterPersonaKey2", "sceneKey", "sceneAssetKey", "props", "propNames", "propKeys", "usedProps", "objects", "objectNames"],
                promptFields: ["imageGenerationPrompt", "storyboardPrompt", "videoMotionPrompt", "motionPrompt"],
                nativeAudioFields: ["dialogue", "voice", "soundEffect", "musicRhythm"],
                subtitleFields: ["subtitleText", "subtitleStartTime", "subtitleEndTime"],
                example: {
                    shotNumber: "1",
                    startTime: "0s",
                    endTime: "4s",
                    duration: "4s",
                    visualDescription: "角色在已锁定场景中完成一个可见动作",
                    character1: "主角显示名",
                    characterDescription1: "角色身份和本镜状态",
                    characterImage1: "approved asset URL",
                    characterAssetId1: "character_asset_id",
                    characterPersonaKey1: "hero",
                    character2: "",
                    characterDescription2: "",
                    characterImage2: "",
                    sceneKey: "scene_office",
                    sceneTags: ["办公室", "夜景"],
                    propKeys: ["prop_product"],
                    referenceImage: "",
                    shotType: "中景",
                    characterAction: "明确的起止动作",
                    emotion: "焦虑转惊喜",
                    lightingAtmosphere: "冷蓝主光转暖金",
                    musicRhythm: "克制的电子脉冲，随动作加速",
                    voice: "主角自然口语，近讲收音",
                    soundEffect: "办公室底噪与动作拟音",
                    dialogue: "主角：这次终于对了。",
                    subtitleText: "这次终于对了。",
                    subtitleStartTime: "1.2s",
                    subtitleEndTime: "3.4s",
                    storyboardPrompt: "完整原生分镜图提示词",
                    motionPrompt: "只描述本镜变化的视频运动提示词",
                },
            },
        },
        nativeAudioPolicy: {
            generateAudio: true,
            rule: "Every generated shot video must ask the selected video model for synchronized dialogue, voice, ambience, foley and music intent in the first generation pass.",
            subtitles: "When subtitles are required, their exact text and timing come from the storyboard row and are passed into the video prompt and node timeline.",
            postProduction: "Use post-production only for final editing or when generated background music is unsuitable; never use silent-video-plus-later-audio as the default route.",
        },
        assetSchema: {
            kinds: ["角色", "场景", "道具"],
            required: ["id", "kind", "title", "imageUrl", "prompt", "modelId", "createdAt"],
            continuityMetadata: ["assetStage", "personaId", "reviewStatus", "reviewedAt", "sourceNodeId", "cleanPlate"],
            optionalGenerationMetadata: ["aspectRatio", "imageSize", "quality", "generationJobId", "generationTaskId", "generationTaskType", "generationProviderKey", "generationError"],
        },
        sequence: [
            "create or reuse exactly one script-v2; never create per-shot generic script nodes",
            "run that script-v2 with scriptV2Stage=confirm-shots to produce complete rows including native audio intent and optional subtitle text/timing",
            "run the same script-v2 with scriptV2Stage=prepare-assets to extract stable character, scene and prop records",
            "prepare every independent asset in the current dependency wave, execute the complete wave with one run-batch at up to 200 concurrency, then inspect and approve each result",
            "import approved character, scene and prop assets with script-import-assets; existing canvas asset nodes are reused by later matching",
            "submit every row index once through storyboard-create-images; it creates all native storyboard placeholders and executes up to 200 independent rows concurrently",
            "connect the script node to the storyboard group once and connect the asset group to the storyboard group once; never fan either group-level relationship out to every shot",
            "each shot connects only the character, scene and prop assets matched by that row's keys and names",
            "create and execute native-audio video generators from completed storyboard images with storyboard-create-videos and generateAudio=true",
            "connect completed shot videos to one playlist only for final editing/export or exceptional background-music correction",
        ],
        pixarAnimationAdContinuityGate: {
            strictStageOrder: ["delivery-spec", "brand-style-bible", "character-bible", "creative-script-lyrics", "storyboard", "shot-video", "sound", "brand-end-frame", "composition", "final-qa"],
            stageNodeFields: ["workflowSkillId", "workflowSkillStage", "workflowSkillStageStatus", "workflowSkillPersonaIds"],
            identityOrder: ["character-identity-master", "character-face-turnaround", "character-body-turnaround", "character-expression-sheet"],
            environmentOrder: ["scene-master", "scene-lighting-variant"],
            productOrder: ["product-master", "product-turnaround"],
            approvalCycle: ["run-batch complete dependency wave", "inspect-result each output", "update workflowAssetReviewStatus=approved"],
            mandatoryCompoundOrder: ["complete delivery-spec", "complete brand-style-bible", "complete character-bible and every declared persona asset", "create creative-script-lyrics script-v2", "run script-v2 confirm-shots", "run script-v2 prepare-assets", "script-import-assets", "storyboard-create-images", "storyboard-create-videos", "playlist run"],
            identityMasterRule: "one independent single-character clean-background image per persona; contact sheets and turnarounds are QA only",
            sceneMasterRule: "clean empty plate only; no character, person, animal, mascot, body part, performer reflection, or performer shadow",
            modelRule: "character derived assets and storyboard images use the same enabled image model as that persona identity master",
            assetBatchRule: "create every node in the current dependency wave before generation; two or more nodes must be submitted together with run-batch and concurrency=min(200,item count)",
            storyboardBatchRule: "the first storyboard-create-images request contains every script row index; storyboard-regenerate-images retries only failed or blank rows",
        },
        connectionRules: {
            reuseExistingAssets: true,
            imageShot: "script -> storyboard group; asset group -> storyboard group; only per-row matched asset nodes -> that row's native image-generator",
            noGroupFanOut: "never connect the script node or asset group directly to every storyboard child",
            videoShot: "completed storyboard image plus only its matched asset nodes -> corresponding video generator",
            noDuplicateAssets: "never create a second ordinary asset node when a matching workflowScriptV2AssetId or existing connected asset node is already on canvas",
        },
        terminology: {
            keyframe: "on the workflow canvas, a plot keyframe is a native image-generator configured with workflowStoryboardSourceNodeId and workflowStoryboardSourceRowIndex; completion updates its mediaUrl without converting it to an ordinary image",
            script: "one canonical script-v2 owns all shot rows, character keys, scene keys, prop keys, image prompts, motion prompts, native audio intent and subtitle timing",
        },
        imageRequest: ["nodeId", "rowIndexes", "prompt", "modelId", "aspectRatio", "imageSize", "quality", "stylePreset", "cameraControl", "workflowExtraParameters", "enableWebSearch", "deferGeneration"],
        videoRequest: ["nodeId", "modelId", "aspectRatio", "videoResolution", "videoDuration", "videoMethod", "generateAudio=true", "enableWebSearch", "workflowExtraParameters", "rowIndexes", "rowDurations", "deferGeneration", "maxClipDurationSeconds"],
        executionAuthority: "compound operations delegate to native canvas callbacks; do not call supplier or direct-media APIs",
    }
}

export function codexCanvasCommandSchema() {
    return {
        contractVersion: CODEX_CANVAS_CONTRACT_VERSION,
        nodeKinds: ["text", "image", "video", "audio", "script", "script-v2", "playlist", "threed", "director-console-3d", "group"],
        generatorKinds: {
            image: { kind: "image", data: { mediaRole: "generator", componentType: "image-generator" } },
            video: { kind: "video", data: { mediaRole: "generator", componentType: "video-generator", generateAudio: true } },
            audio: { kind: "audio", data: { componentType: "audio-generator" } },
        },
        nodeContracts: codexCanvasNodeContracts(),
        storyboardWorkflow: codexCanvasStoryboardWorkflowContract(),
        editableDataFields: Array.from(CODEX_CANVAS_NODE_DATA_FIELDS),
        operations: ["snapshot", "models", "create", "update", "connect", "disconnect", "delete", "run", "run-batch", "wait", "inspect-result", "script-create-input", "script-import-assets", "storyboard-create-images", "storyboard-regenerate-images", "storyboard-create-videos"],
        interaction: {
            createPlacement: `create defaults to production-stage columns ordered ${CODEX_WORKFLOW_STAGE_ORDER.join(" -> ")}; nodes in the same stage stack top-to-bottom and every commit checks live canvas collisions`,
            exactPlacement: "set placementMode=exact with position or frame coordinates; an occupied request falls back to its production-stage column",
            chooseModel: "query the required kind through models, then set data.modelId to the returned provider-qualified runtime id",
            chooseParameters: "set common controls on aspectRatio/imageSize/videoMethod/videoDuration/videoResolution/generationCount and model-specific schema values under workflowExtraParameters",
            references: "connect an existing image/video/audio material node to the generator; the native generator derives provider references from incoming edges",
            prompt: "store the provider prompt in data.prompt so it remains visible and editable in the generator input",
            result: "the native generator writes provider task metadata, progress, errors and durable media URLs back to the same node",
            scriptInput: "script-create-input accepts inputType and initialContent either at the payload top level or inside payload.request",
            scriptV2Run: "run payload must include scriptV2Stage=confirm-shots, then scriptV2Stage=prepare-assets on the same script-v2 node",
        },
        batchExecution: { operation: "run-batch", maxItems: 200, maxConcurrency: 200, settleMode: "all-settled", billing: "native-per-node", singleRunPolicy: "only one pending item or one explicit force=true retry" },
        storyboardBatchExecution: { operation: "storyboard-create-images", maxItems: 200, maxConcurrency: 200, firstRun: "all rowIndexes", retryOperation: "storyboard-regenerate-images", retryScope: "failed-or-blank-only", topology: "script->storyboard group; asset group->storyboard group; matched assets->individual storyboard generators" },
        execution: "run invokes one native generator send action; run-batch invokes up to 200 independent native sends concurrently and waits for every node to settle",
    }
}

const CODEX_CANVAS_SNAPSHOT_STRING_LIMIT = 12_000
const CODEX_CANVAS_SNAPSHOT_ARRAY_LIMIT = 120

function compactCodexSnapshotValue(value: unknown, depth = 0): unknown {
    if (typeof value === "string") {
        if (value.length <= CODEX_CANVAS_SNAPSHOT_STRING_LIMIT) return value
        return `${value.slice(0, CODEX_CANVAS_SNAPSHOT_STRING_LIMIT)}\n...[snapshot value truncated]`
    }
    if (Array.isArray(value)) {
        const items = value.slice(0, CODEX_CANVAS_SNAPSHOT_ARRAY_LIMIT).map((item) => compactCodexSnapshotValue(item, depth + 1))
        if (value.length > CODEX_CANVAS_SNAPSHOT_ARRAY_LIMIT) {
            items.push(`[${value.length - CODEX_CANVAS_SNAPSHOT_ARRAY_LIMIT} more items omitted]`)
        }
        return items
    }
    if (!value || typeof value !== "object") return value
    if (depth >= 8) return "[nested snapshot value omitted]"
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .map(([key, entry]) => [key, compactCodexSnapshotValue(entry, depth + 1)]))
}

function compactCodexModelOption(option: unknown) {
    if (!option || typeof option !== "object" || Array.isArray(option)) return compactCodexSnapshotValue(option)
    const value = option as Record<string, any>
    const config = value.config && typeof value.config === "object" && !Array.isArray(value.config)
        ? value.config as Record<string, any>
        : {}
    const compactConfig = Object.fromEntries([
        "requestField",
        "control",
        "min",
        "max",
        "step",
        "width",
        "height",
        "methods",
        "isDefault",
    ].filter((key) => config[key] !== undefined).map((key) => [key, compactCodexSnapshotValue(config[key])]))
    return {
        ...(value.id !== undefined ? { id: value.id } : {}),
        ...(value.label !== undefined ? { label: value.label } : {}),
        ...(value.value !== undefined ? { value: value.value } : {}),
        ...(value.isDefault !== undefined ? { isDefault: value.isDefault } : {}),
        ...(Object.keys(compactConfig).length ? { config: compactConfig } : {}),
    }
}

function compactCodexModelParameterDefinition(definition: unknown) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) return compactCodexSnapshotValue(definition)
    const value = definition as Record<string, any>
    const config = value.config && typeof value.config === "object" && !Array.isArray(value.config)
        ? value.config as Record<string, any>
        : {}
    return {
        type: value.type,
        label: value.label,
        control: value.control || config.control,
        defaultValue: value.defaultValue ?? config.defaultValue,
        requestField: value.requestField || config.requestField,
        min: value.min ?? config.min,
        max: value.max ?? config.max,
        step: value.step ?? config.step,
        methods: compactCodexSnapshotValue(value.methods || config.methods || []),
        options: Array.isArray(value.options) ? value.options.map(compactCodexModelOption) : [],
    }
}

function compactCodexModelExecutionContract(contract: unknown) {
    if (!contract || typeof contract !== "object" || Array.isArray(contract)) return undefined
    const value = contract as Record<string, any>
    const modeContracts = Array.isArray(value.modeContracts) ? value.modeContracts.map((mode: any) => ({
        id: mode?.id,
        label: mode?.label,
        isDefault: mode?.isDefault,
        required: compactCodexSnapshotValue(mode?.required || mode?.config?.required || []),
        requiredAny: compactCodexSnapshotValue(mode?.requiredAny || mode?.config?.requiredAny || []),
        disallow: compactCodexSnapshotValue(mode?.disallow || mode?.config?.disallow || []),
        category: mode?.category || mode?.config?.category,
        sends: compactCodexSnapshotValue(mode?.sends || mode?.config?.sends || []),
        imageUrls: compactCodexSnapshotValue(mode?.imageUrls || mode?.config?.imageUrls),
        videoUrls: compactCodexSnapshotValue(mode?.videoUrls || mode?.config?.videoUrls),
        audioUrls: compactCodexSnapshotValue(mode?.audioUrls || mode?.config?.audioUrls),
    })) : []
    return {
        execution: value.execution,
        instruction: value.instruction,
        commonNodeFields: compactCodexSnapshotValue(value.commonNodeFields || []),
        modeContracts,
        referenceRoles: compactCodexSnapshotValue(value.referenceRoles || []),
        output: compactCodexSnapshotValue(value.output || {}),
    }
}

function compactCodexModelParameters(parameters: unknown) {
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return {}
    const value = parameters as Record<string, any>
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
        if (["executionContract", "extraParameters", "methods"].includes(key)) continue
        if (["aspectRatios", "resolutions", "durations", "counts", "qualities", "modes"].includes(key)) {
            result[key] = Array.isArray(entry) ? entry.map(compactCodexModelOption) : []
            continue
        }
        result[key] = compactCodexSnapshotValue(entry)
    }
    return result
}

function codexModelParameterProfileId(model: any) {
    const parameters = model?.parameters && typeof model.parameters === "object" && !Array.isArray(model.parameters)
        ? model.parameters as Record<string, any>
        : {}
    const capabilityMetadata = parameters.executionContract?.capabilityMetadata
    const sharedProfile = String(capabilityMetadata?.sharedParameterProfile || "").trim()
    const fallback = [model?.providerKey, parameters.modelFamily, model?.runtimeId || model?.id]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(":")
    return (sharedProfile || fallback || "default")
        .toLowerCase()
        .replace(/[^a-z0-9._:-]+/g, "-")
        .slice(0, 160)
}

function compactCodexModelParameterProfile(parameters: unknown) {
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return {}
    const value = parameters as Record<string, any>
    return {
        extraParameters: Array.isArray(value.extraParameters) ? value.extraParameters.map(compactCodexModelParameterDefinition) : [],
        executionContract: compactCodexModelExecutionContract(value.executionContract),
    }
}

function codexWorkflowModelCatalogEntry(model: any, parameterProfileId: string) {
    const identity = [model?.id, model?.runtimeId, model?.modelId, model?.name, model?.description, model?.parameters?.modelFamily]
        .map((value) => String(value || "").toLowerCase())
        .join(" ")
    const selectionSignals: string[] = []
    if (/midjourney|(^|[\s_-])m(?:j|d)([\s_-]|$)|niji/.test(identity)) {
        selectionSignals.push("角色草图", "概念设计", "风格探索", "插画", "角色设定")
    }
    if (/gpt-image/.test(identity)) selectionSignals.push("精确图像编辑", "文字排版", "复杂指令遵循")
    if (/seedream|即梦/.test(identity)) selectionSignals.push("写实人像", "摄影写真", "通用生图与改图")
    if (/flux/.test(identity)) selectionSignals.push("通用文生图", "概念视觉")
    if (/seedance/.test(identity)) selectionSignals.push("多素材视频", "人物一致性", "电影镜头", "原生同步声音")
    return {
        id: model?.id,
        runtimeId: model?.runtimeId || model?.id,
        modelId: model?.modelId,
        name: model?.name,
        description: model?.description || model?.descriptionKey,
        providerKey: model?.providerKey,
        category: model?.category,
        isDefault: Boolean(model?.isDefault),
        isPro: Boolean(model?.isPro),
        billing: compactCodexSnapshotValue(model?.billing),
        cost: compactCodexSnapshotValue(model?.cost),
        capabilities: compactCodexSnapshotValue(model?.capabilities),
        selectionSignals: Array.from(new Set(selectionSignals)),
        parameterProfileId,
        parameters: compactCodexModelParameters(model?.parameters),
    }
}

export function buildCodexWorkflowModelCatalog(groups: Record<string, any[]>) {
    const modelCatalog: Record<string, unknown[]> = {}
    const modelParameterProfiles: Record<string, unknown> = {}
    for (const [kind, models] of Object.entries(groups)) {
        modelCatalog[kind] = models.map((model) => {
            const parameterProfileId = codexModelParameterProfileId(model)
            if (!modelParameterProfiles[parameterProfileId]) {
                modelParameterProfiles[parameterProfileId] = compactCodexModelParameterProfile(model?.parameters)
            }
            return codexWorkflowModelCatalogEntry(model, parameterProfileId)
        })
    }
    return { modelCatalog, modelParameterProfiles }
}

const CODEX_MODEL_QUERY_LIMIT = 12
const CODEX_MODEL_INTENT_HINTS = [
    "草图",
    "角色",
    "概念",
    "插画",
    "写实",
    "人像",
    "编辑",
    "文字",
    "多素材",
    "电影",
    "有声",
    "同步声音",
    "联网",
    "尾帧",
    "3d",
]

function codexModelQueryScore(model: Record<string, any>, query: string) {
    if (!query) return model.isDefault ? 2 : 0
    const haystack = [
        model.id,
        model.runtimeId,
        model.modelId,
        model.name,
        model.description,
        ...(Array.isArray(model.selectionSignals) ? model.selectionSignals : []),
    ].map((value) => String(value || "").toLowerCase()).join(" ")
    const normalizedQuery = query.toLowerCase()
    const terms = Array.from(new Set([
        ...normalizedQuery.split(/[\s,，。；;、/]+/).map((item) => item.trim()).filter((item) => item.length >= 2),
        ...CODEX_MODEL_INTENT_HINTS.filter((item) => normalizedQuery.includes(item)),
    ]))
    const matchedTerms = terms.filter((term) => haystack.includes(term)).length
    return matchedTerms * 10 + (model.isDefault ? 2 : 0)
}

export function queryCodexWorkflowModelCatalog(params: {
    kind: string
    catalog: Record<string, unknown[]>
    parameterProfiles: Record<string, unknown>
    query?: string
    modelId?: string
    includeParameters?: boolean
    limit?: number
}) {
    const available = Array.isArray(params.catalog[params.kind])
        ? params.catalog[params.kind] as Array<Record<string, any>>
        : []
    const modelId = String(params.modelId || "").trim()
    const query = String(params.query || "").trim()
    const limit = Math.max(1, Math.min(CODEX_MODEL_QUERY_LIMIT, Math.floor(Number(params.limit) || 6)))
    const ranked = available.map((model, index) => ({
        model,
        index,
        score: modelId
            ? [model.id, model.runtimeId, model.modelId].some((value) => String(value || "") === modelId) ? 1_000 : -1
            : codexModelQueryScore(model, query),
    }))
        .filter((item) => item.score >= 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
    const selected = ranked.slice(0, modelId ? 1 : limit).map((item) => item.model)
    const includeProfiles = Boolean(modelId || params.includeParameters)
    const selectedProfileIds = new Set(selected.map((model) => String(model.parameterProfileId || "")).filter(Boolean))
    const selectedProfiles = includeProfiles
        ? Object.fromEntries(Object.entries(params.parameterProfiles).filter(([profileId]) => selectedProfileIds.has(profileId)))
        : {}
    return {
        kind: params.kind,
        query,
        requestedModelId: modelId,
        availableCount: available.length,
        returnedCount: selected.length,
        truncated: selected.length < available.length && !modelId,
        models: selected,
        modelParameterProfiles: selectedProfiles,
        next: selected.length && !includeProfiles
            ? "Choose one runtimeId, then call models again with modelId and includeParameters=true before run."
            : "Use only supported fields and pass model-specific values through workflowExtraParameters.",
    }
}

export function codexWorkflowCanvasNodeEntry(node: LibTvWorkflowNode) {
    return {
        id: node.id,
        kind: node.kind,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        parentId: node.parentId,
        locked: node.locked,
        data: compactCodexSnapshotValue(sanitizeCodexCanvasNodeData(node.data)),
        codexLayout: node.data?.workflowCodexTaskId ? {
            taskId: node.data.workflowCodexTaskId,
            anchorX: node.data.workflowCodexLayoutAnchorX,
            anchorY: node.data.workflowCodexLayoutAnchorY,
            index: node.data.workflowCodexLayoutIndex,
            stage: node.data.workflowCodexLayoutStage,
            row: node.data.workflowCodexLayoutRow,
        } : undefined,
    }
}

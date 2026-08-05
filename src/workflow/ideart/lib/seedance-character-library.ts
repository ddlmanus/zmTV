import { workflowFetch } from "@/workflow/backend/client";
import { getWorkflowErrorMessage } from "./error-message";

export type SeedanceCharacterLibraryAssetInput = {
  projectId?: string | null;
  name: string;
  assetId: string;
  assetUrl: string;
  referenceImageUrl: string;
  assetType: "Image" | "Video" | "Audio";
  modelId?: string;
  platformFileId?: number;
  sourceNodeId?: string;
};

export async function saveSeedanceCharacterLibraryAsset(
  input: SeedanceCharacterLibraryAssetInput,
) {
  const projectId = String(input.projectId || "").trim();
  const assetKey = "seedance-virtual-" + input.assetId;
  const response = await workflowFetch("/api/libtv/assets/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      projectId: projectId || undefined,
      scope: projectId ? undefined : "user",
      asset: {
        name: input.name,
        characterKey: assetKey,
        personaKey: assetKey,
        variantLabel: "虚拟素材",
        source: "seedance-virtual-avatar",
        assetUrl: input.assetUrl,
        referenceImageUrl: input.referenceImageUrl,
        referenceImageUrls: [input.referenceImageUrl],
        metadata: {
          mode: "private",
          platformFileId: input.platformFileId,
          validationStatus: "completed",
          assetId: input.assetId,
          assetUrl: input.assetUrl,
          originalUrl: input.referenceImageUrl,
          assetType: input.assetType,
          modelId: input.modelId || "volcengine-doubao-video",
          sourceNodeId: input.sourceNodeId,
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      getWorkflowErrorMessage(payload, "保存 Seedance2.0 合规素材失败"),
    );
  }
  return payload?.item || payload?.items?.[0] || null;
}

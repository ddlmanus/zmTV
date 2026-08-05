import { create } from "zustand";

type GenerationMode = "image" | "video";

interface AgentState {
  selectedModel: string;
  generationMode: GenerationMode;
  aspectRatio: string;
  resolution: string;
  imageQuality: string;
  videoDuration: string;
  videoMethod: string;
  videoMode: string;
  generationCount: number;
  canvasImagePick: { owner: string; label?: string } | null;
  setSelectedModel: (model: string, outputType?: GenerationMode) => void;
  selectModelManually: (model: string, outputType?: GenerationMode) => void;
  setGenerationMode: (mode: GenerationMode) => void;
  setAspectRatio: (ratio: string) => void;
  setResolution: (resolution: string) => void;
  setImageQuality: (quality: string) => void;
  setVideoDuration: (duration: string) => void;
  setVideoMethod: (method: string) => void;
  setVideoMode: (mode: string) => void;
  setGenerationCount: (count: number) => void;
  setCanvasImagePick: (pick: { owner: string; label?: string } | null) => void;
  cancelCanvasImagePick: (owner?: string) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  selectedModel: "",
  generationMode: "image",
  aspectRatio: "1:1",
  resolution: "1k",
  imageQuality: "auto",
  videoDuration: "5s",
  videoMethod: "first_frame",
  videoMode: "std",
  generationCount: 1,
  canvasImagePick: null,
  setSelectedModel: (model, outputType) =>
    set((state) => ({
      selectedModel: model,
      generationMode: outputType || state.generationMode,
    })),
  selectModelManually: (model, outputType) =>
    set((state) => ({
      selectedModel: model,
      generationMode: outputType || state.generationMode,
    })),
  setGenerationMode: (generationMode) => set({ generationMode }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setResolution: (resolution) => set({ resolution }),
  setImageQuality: (imageQuality) => set({ imageQuality }),
  setVideoDuration: (videoDuration) => set({ videoDuration }),
  setVideoMethod: (videoMethod) => set({ videoMethod }),
  setVideoMode: (videoMode) => set({ videoMode }),
  setGenerationCount: (generationCount) => set({ generationCount }),
  setCanvasImagePick: (canvasImagePick) => set({ canvasImagePick }),
  cancelCanvasImagePick: (owner) =>
    set((state) => {
      if (!owner || state.canvasImagePick?.owner === owner) {
        return { canvasImagePick: null };
      }
      return {};
    }),
}));

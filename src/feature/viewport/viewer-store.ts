import { create } from "zustand";
import type { ModelStats } from "./engine/models";
import type { CameraPreset } from "./engine/viewer";

type ViewerState = {
  materialIsolation: { sessionId: string; variantId: string; materialIndex: number | null } | null;
  projection: { referenceId: string; sessionId: string; opacity: number; scale: number; x: number; y: number } | null;
  status: "loading" | "ready" | "error";
  stats: ModelStats | null;
  error: string | null;
  cameraRequest: { preset: CameraPreset; id: number } | null;
  requestCamera: (preset: CameraPreset) => void;
  dismissError: () => void;
};

export const useViewerStore = create<ViewerState>()((set, get) => ({
  materialIsolation: null,
  projection: null,
  status: "loading",
  stats: null,
  error: null,
  cameraRequest: null,
  requestCamera: (preset) => set({ cameraRequest: { preset, id: (get().cameraRequest?.id ?? 0) + 1 } }),
  dismissError: () => set({ error: null }),
}));

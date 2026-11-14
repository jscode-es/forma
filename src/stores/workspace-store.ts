import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SectionId = "create3d" | "createAnimation" | "export";
export type InspectorTab = "create" | "model" | "finish" | "edit" | "animation" | "export";
export type DockTab = "session" | "jobs" | "process" | "timeline";
export type ViewMode = "material" | "solid" | "wireframe";

const SECTION_TAB: Record<SectionId, InspectorTab> = {
  create3d: "create",
  createAnimation: "animation",
  export: "export",
};

type WorkspaceState = {
  section: SectionId;
  inspectorTab: InspectorTab;
  dockTab: DockTab;
  viewMode: ViewMode;
  showGrid: boolean;
  setSection: (section: SectionId) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setDockTab: (tab: DockTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setShowGrid: (show: boolean) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      section: "create3d",
      inspectorTab: "create",
      dockTab: "session",
      viewMode: "material",
      showGrid: true,
      setSection: (section) => set({ section, inspectorTab: SECTION_TAB[section] }),
      setInspectorTab: (inspectorTab) => set({ inspectorTab }),
      setDockTab: (dockTab) => set({ dockTab }),
      setViewMode: (viewMode) => set({ viewMode }),
      setShowGrid: (showGrid) => set({ showGrid }),
    }),
    {
      name: "forma-workspace",
      skipHydration: true,
      partialize: ({ section, inspectorTab, dockTab, viewMode, showGrid }) => ({
        section,
        inspectorTab,
        dockTab,
        viewMode,
        showGrid,
      }),
    },
  ),
);

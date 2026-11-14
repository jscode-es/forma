import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SectionId = "createReference" | "create3d" | "createAnimation" | "export";
export type InspectorTab =
  | "text"
  | "views"
  | "create"
  | "model"
  | "finish"
  | "edit"
  | "capture"
  | "rig"
  | "clips"
  | "retarget"
  | "files"
  | "interchange";
export type DockTab = "session" | "jobs" | "process" | "timeline";
export type ViewMode = "material" | "solid" | "wireframe";

const DEFAULT_TABS: Record<SectionId, InspectorTab> = {
  createReference: "text",
  create3d: "create",
  createAnimation: "capture",
  export: "files",
};

type WorkspaceState = {
  section: SectionId;
  tabs: Record<SectionId, InspectorTab>;
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
      tabs: DEFAULT_TABS,
      dockTab: "session",
      viewMode: "material",
      showGrid: true,
      setSection: (section) => set({ section }),
      setInspectorTab: (tab) => set((s) => ({ tabs: { ...s.tabs, [s.section]: tab } })),
      setDockTab: (dockTab) => set({ dockTab }),
      setViewMode: (viewMode) => set({ viewMode }),
      setShowGrid: (showGrid) => set({ showGrid }),
    }),
    {
      name: "forma-workspace",
      version: 1,
      skipHydration: true,
      migrate: (persisted) => {
        const { inspectorTab: _old, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return { ...rest, tabs: DEFAULT_TABS } as unknown as WorkspaceState;
      },
      partialize: ({ section, tabs, dockTab, viewMode, showGrid }) => ({ section, tabs, dockTab, viewMode, showGrid }),
    },
  ),
);

export function currentTab(s: Pick<WorkspaceState, "section" | "tabs">): InspectorTab {
  return s.tabs[s.section] ?? DEFAULT_TABS[s.section];
}

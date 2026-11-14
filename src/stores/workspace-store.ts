import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SectionId = "create3d" | "createAnimation" | "export";
export type InspectorTab =
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
  create3d: "create",
  createAnimation: "capture",
  export: "files",
};

export type ReferenceTab = "text" | "single" | "multi";

type WorkspaceState = {
  referenceTab: ReferenceTab;
  setReferenceTab: (tab: ReferenceTab) => void;
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
      referenceTab: "single",
      setReferenceTab: (referenceTab) => set({ referenceTab }),
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
      version: 2,
      skipHydration: true,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        const tabs = (state.tabs ?? {}) as Record<string, InspectorTab>;
        return {
          ...state,
          section: state.section === "createReference" ? "create3d" : state.section ?? "create3d",
          referenceTab: "single",
          tabs: {
            create3d: tabs.create3d ?? DEFAULT_TABS.create3d,
            createAnimation: tabs.createAnimation ?? DEFAULT_TABS.createAnimation,
            export: tabs.export ?? DEFAULT_TABS.export,
          },
        } as unknown as WorkspaceState;
      },
      partialize: ({ section, tabs, referenceTab, dockTab, viewMode, showGrid }) => ({ section, tabs, referenceTab, dockTab, viewMode, showGrid }),
    },
  ),
);

export function currentTab(s: Pick<WorkspaceState, "section" | "tabs">): InspectorTab {
  return s.tabs[s.section] ?? DEFAULT_TABS[s.section];
}

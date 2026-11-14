import { create } from "zustand";

export type SectionId = "create3d" | "createAnimation";

type WorkspaceState = {
  section: SectionId;
  setSection: (section: SectionId) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  section: "create3d",
  setSection: (section) => set({ section }),
}));

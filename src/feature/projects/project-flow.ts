import { create } from "zustand";
import type { FormaApi } from "@/lib/forma";
import { currentSettings, useProjectStore } from "@/stores/project-store";

type Pending = () => void | Promise<void>;

type FlowState = {
  saveOpen: boolean;
  afterSave: Pending | null;
  guard: Pending | null;
  busy: boolean;
  error: string | null;
};

export const useProjectFlow = create<FlowState>()(() => ({
  saveOpen: false,
  afterSave: null,
  guard: null,
  busy: false,
  error: null,
}));

function api(): FormaApi {
  if (!window.forma) throw new Error("Desktop API unavailable");
  return window.forma;
}

async function run(action: Pending) {
  useProjectFlow.setState({ busy: true });
  try {
    await action();
  } catch (error) {
    useProjectFlow.setState({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    useProjectFlow.setState({ busy: false });
  }
}

export function saveProject(after?: Pending) {
  const { id, name } = useProjectStore.getState();
  if (!id) {
    useProjectFlow.setState({ saveOpen: true, afterSave: after ?? null });
    return;
  }
  return run(async () => {
    useProjectStore.getState().load(await api().projects.update(id, { name: name ?? "", settings: currentSettings() }));
    await after?.();
  });
}

export function saveProjectAs(name: string) {
  const { afterSave } = useProjectFlow.getState();
  useProjectFlow.setState({ saveOpen: false, afterSave: null });
  return run(async () => {
    useProjectStore.getState().load(await api().projects.create({ name, settings: currentSettings() }));
    await afterSave?.();
  });
}

export function cancelSave() {
  useProjectFlow.setState({ saveOpen: false, afterSave: null });
}

function withGuard(action: Pending) {
  if (useProjectStore.getState().dirty) useProjectFlow.setState({ guard: action });
  else return run(action);
}

export function resolveGuard(choice: "save" | "discard" | "cancel") {
  const action = useProjectFlow.getState().guard;
  useProjectFlow.setState({ guard: null });
  if (!action || choice === "cancel") return;
  if (choice === "discard") return run(action);
  return saveProject(action);
}

export function openProject(id: string) {
  return withGuard(async () => useProjectStore.getState().load(await api().projects.open(id)));
}

export function startNewProject() {
  return withGuard(() => useProjectStore.getState().newProject());
}

export function requestClose() {
  return withGuard(() => api().app.confirmClose());
}

export async function restoreLastProject() {
  const project = await window.forma?.projects.last();
  if (project) useProjectStore.getState().load(project);
}

export function dismissError() {
  useProjectFlow.setState({ error: null });
}

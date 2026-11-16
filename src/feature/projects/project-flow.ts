import { create } from "zustand";
import type { FormaApi } from "@/lib/forma";
import { currentScene, currentSettings, useProjectStore } from "@/stores/project-store";
import { blockPainting, discardPaint, hasPaintChanges, savePaintVariant } from "@/feature/paint";
import { blockAnimation, discardAnimation, hasAnimationChanges, saveAnimationVariant } from "@/feature/animation";

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
  blockPainting(true);
  blockAnimation(true);
  useProjectFlow.setState({ busy: true });
  try {
    await action();
  } catch (error) {
    useProjectFlow.setState({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    blockPainting(false);
    blockAnimation(false);
    useProjectFlow.setState({ busy: false });
  }
}

export function saveProject(after?: Pending): Promise<void> | undefined {
  if (useProjectFlow.getState().busy) return;
  return saveCurrentProject(after);
}

function saveCurrentProject(after?: Pending): Promise<void> | undefined {
  const { id } = useProjectStore.getState();
  if (!id) {
    useProjectFlow.setState({ saveOpen: true, afterSave: after ?? null });
    return;
  }
  return run(async () => {
    const sessionId = useProjectStore.getState().sessionId;
    await savePaintVariant();
    if (useProjectStore.getState().sessionId !== sessionId) return;
    await saveAnimationVariant();
    if (useProjectStore.getState().sessionId !== sessionId) return;
    const snapshot = { name: useProjectStore.getState().name, settings: currentSettings(), scene: currentScene() };
    const project = await api().projects.update(id, { name: snapshot.name ?? "", settings: snapshot.settings, scene: snapshot.scene });
    if (useProjectStore.getState().sessionId !== sessionId) return;
    useProjectStore.getState().acceptSaved(project, snapshot);
    if (after && (useProjectStore.getState().dirty || hasPaintChanges() || hasAnimationChanges())) return saveCurrentProject(after);
    await after?.();
  });
}

export function saveProjectAs(name: string) {
  if (useProjectFlow.getState().busy) return;
  const { afterSave } = useProjectFlow.getState();
  useProjectFlow.setState({ saveOpen: false, afterSave: null });
  return run(async () => {
    const sessionId = useProjectStore.getState().sessionId;
    await savePaintVariant();
    if (useProjectStore.getState().sessionId !== sessionId) return;
    await saveAnimationVariant();
    if (useProjectStore.getState().sessionId !== sessionId) return;
    const snapshot = { name: useProjectStore.getState().name, settings: currentSettings(), scene: currentScene() };
    const project = await api().projects.create({ name, settings: snapshot.settings, scene: snapshot.scene });
    if (useProjectStore.getState().sessionId !== sessionId) return;
    useProjectStore.getState().acceptSaved(project, snapshot);
    if (afterSave && (useProjectStore.getState().dirty || hasPaintChanges() || hasAnimationChanges())) return saveCurrentProject(afterSave);
    await afterSave?.();
  });
}

export function cancelSave() {
  useProjectFlow.setState({ saveOpen: false, afterSave: null });
}

function withGuard(action: Pending) {
  if (useProjectFlow.getState().busy) return;
  if (useProjectStore.getState().dirty || hasPaintChanges() || hasAnimationChanges()) useProjectFlow.setState({ guard: action });
  else return run(action);
}

export function resolveGuard(choice: "save" | "discard" | "cancel") {
  if (useProjectFlow.getState().busy) return;
  const action = useProjectFlow.getState().guard;
  useProjectFlow.setState({ guard: null });
  if (!action || choice === "cancel") return;
  if (choice === "discard") {
    discardPaint();
    discardAnimation();
    return run(action);
  }
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

export async function restoreLastSettings() {
  const project = await window.forma?.projects.last();
  if (project) useProjectStore.setState({ ...project.settings, textureReferenceId: null });
}

export function dismissError() {
  useProjectFlow.setState({ error: null });
}

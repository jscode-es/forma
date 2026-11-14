import { create } from "zustand";
import i18n from "@/lib/i18n";
import type { ModelSource, Variant } from "@/lib/forma";
import { inspectMaterials, readPaintSurface, writePaintSurface, type MaterialInfo } from "@/feature/materials";
import { displayedVariant, useProjectStore } from "@/stores/project-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { PaintEngine, type PaintTool, type PaintUV } from "./engine";

type Draft = { sessionId: string; variantId: string; sourceLabel: string; materialIndex: number; bytes: Uint8Array; canvas: HTMLCanvasElement; engine: PaintEngine; imageData: ImageData };
type Options = { tool: PaintTool; color: string; radius: number; opacity: number };
type PaintState = Options & { materials: MaterialInfo[]; draft: Draft | null; busy: boolean; blocked: boolean; enabled: boolean; revision: number; error: string | null; cloneSource: PaintUV | null };

export const usePaintStore = create<PaintState>()(() => ({ materials: [], draft: null, busy: false, blocked: false, enabled: false, revision: 0, error: null, cloneSource: null, tool: "brush", color: "#ff4040", radius: 16, opacity: 1 }));

let materialsRequest = 0;
let saving: Promise<void> | null = null;
let projectBlocks = 0;

function sourceOf(variant: Variant, projectId: string | null): ModelSource {
  if (variant.model.type === "staged") return { type: "staged", stagingId: variant.model.stagingId };
  if (variant.model.type === "asset" && projectId) return { type: "asset", projectId, assetId: variant.model.assetId };
  throw new Error("paint.modelRequired");
}

function reportError(error: unknown) {
  usePaintStore.setState({ error: error instanceof Error ? error.message : "paint.failed" });
}

function redraw(draft: Draft) {
  draft.canvas.getContext("2d")!.putImageData(draft.imageData, 0, 0);
  usePaintStore.setState((state) => ({ revision: state.revision + 1 }));
}

function currentDraft() {
  const state = usePaintStore.getState();
  const project = useProjectStore.getState();
  return state.enabled && !state.busy && !state.blocked && state.draft?.sessionId === project.sessionId && state.draft.variantId === displayedVariant(project).id && !project.comparing ? state.draft : null;
}

export function hasPaintChanges() {
  const draft = usePaintStore.getState().draft;
  return !!draft && draft.sessionId === useProjectStore.getState().sessionId && draft.engine.dirty;
}

export async function loadPaintMaterials() {
  const request = ++materialsRequest;
  const project = useProjectStore.getState();
  const variant = displayedVariant(project);
  usePaintStore.setState({ materials: [] });
  if (!window.forma || variant.model.type === "default-cube") return;
  try {
    const materials = await inspectMaterials(await window.forma.models.read(sourceOf(variant, project.id)));
    if (request === materialsRequest && project.sessionId === useProjectStore.getState().sessionId && variant.id === displayedVariant(useProjectStore.getState()).id) usePaintStore.setState({ materials });
  } catch (error) {
    if (request === materialsRequest) reportError(error);
  }
}

export async function startPainting(materialIndex: number, resolution: number) {
  const state = usePaintStore.getState();
  if (state.busy || state.blocked || state.draft || !window.forma) return;
  const project = useProjectStore.getState();
  const variant = displayedVariant(project);
  project.retainVariant(variant.id);
  usePaintStore.setState({ busy: true, error: null });
  let retained = true;
  try {
    const bytes = await window.forma.models.read(sourceOf(variant, project.id));
    const pixels = await readPaintSurface(bytes, materialIndex, resolution);
    const current = useProjectStore.getState();
    if (current.sessionId !== project.sessionId) return;
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const engine = new PaintEngine(pixels);
    const imageData = new ImageData(engine.pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height);
    const draft: Draft = { sessionId: project.sessionId, variantId: variant.id, sourceLabel: variant.label, materialIndex, bytes, canvas, engine, imageData };
    usePaintStore.setState({ draft, enabled: true, cloneSource: null });
    retained = false;
    useWorkspaceStore.getState().setViewMode("material");
    redraw(draft);
  } catch (error) {
    if (useProjectStore.getState().sessionId === project.sessionId) reportError(error);
  } finally {
    if (retained && useProjectStore.getState().sessionId === project.sessionId) useProjectStore.getState().releaseVariant(variant.id);
    usePaintStore.setState({ busy: false });
  }
}

export function setPaintOptions(patch: Partial<Options>) {
  if (usePaintStore.getState().busy) return;
  endPaintStroke();
  usePaintStore.setState({ ...patch, error: null });
}

export function beginPaintStroke(uv: PaintUV, clonePick = false) {
  const draft = currentDraft();
  if (!draft) return;
  const { tool, color, radius, opacity, cloneSource } = usePaintStore.getState();
  if (clonePick) {
    usePaintStore.setState({ cloneSource: uv, error: null });
    return;
  }
  if (tool === "eyedropper") {
    usePaintStore.setState({ color: draft.engine.sample(uv), error: null });
    return;
  }
  if (tool === "clone" && !cloneSource) {
    usePaintStore.setState({ error: "paint.cloneRequired" });
    return;
  }
  draft.engine.begin(uv, { tool, color, radius, opacity, ...(cloneSource ? { cloneSource } : {}) });
  redraw(draft);
}

export function movePaintStroke(uv: PaintUV) {
  const draft = currentDraft();
  if (!draft) return;
  draft.engine.move(uv);
  redraw(draft);
}

export function endPaintStroke(cancel = false) {
  const draft = usePaintStore.getState().draft;
  if (!draft) return;
  draft.engine.end(cancel);
  redraw(draft);
}

export function undoPaint() {
  const state = usePaintStore.getState();
  if (!state.draft || state.busy) return;
  state.draft.engine.end();
  state.draft.engine.undo();
  redraw(state.draft);
}

export function redoPaint() {
  const state = usePaintStore.getState();
  if (!state.draft || state.busy) return;
  state.draft.engine.end();
  state.draft.engine.redo();
  redraw(state.draft);
}

export function setPaintEnabled(enabled: boolean) {
  endPaintStroke();
  usePaintStore.setState({ enabled });
}

export function resumePainting() {
  const draft = usePaintStore.getState().draft;
  const project = useProjectStore.getState();
  if (!draft || usePaintStore.getState().busy || usePaintStore.getState().blocked || draft.sessionId !== project.sessionId) return;
  project.previewVariant(draft.variantId);
  useWorkspaceStore.getState().setViewMode("material");
  usePaintStore.setState({ enabled: true });
}

export function discardPaint() {
  const state = usePaintStore.getState();
  if (state.busy) return;
  if (state.draft?.sessionId === useProjectStore.getState().sessionId) useProjectStore.getState().releaseVariant(state.draft.variantId);
  usePaintStore.setState({ draft: null, enabled: false, cloneSource: null, error: null });
}

export function savePaintVariant(): Promise<void> {
  if (saving) return saving;
  const draft = usePaintStore.getState().draft;
  if (!draft || draft.sessionId !== useProjectStore.getState().sessionId) return Promise.resolve();
  endPaintStroke();
  if (!draft.engine.dirty) {
    discardPaint();
    return Promise.resolve();
  }
  usePaintStore.setState({ busy: true, error: null });
  saving = (async () => {
    try {
      const bytes = await writePaintSurface(draft.bytes, draft.materialIndex, draft.engine.pixels);
      const model = await window.forma!.models.stageBytes(bytes, draft.sourceLabel);
      const project = useProjectStore.getState();
      if (project.sessionId !== draft.sessionId || usePaintStore.getState().draft !== draft) return;
      project.addVariant({ label: i18n.t("paint.variant", { name: draft.sourceLabel }), origin: "paint", engineId: null, model, lods: [], params: { materialIndex: draft.materialIndex, width: draft.canvas.width, height: draft.canvas.height } }, false, draft.variantId);
      project.releaseVariant(draft.variantId);
      usePaintStore.setState({ draft: null, enabled: false, cloneSource: null });
    } catch (error) {
      if (useProjectStore.getState().sessionId === draft.sessionId) reportError(error);
      throw error;
    } finally {
      usePaintStore.setState({ busy: false });
      saving = null;
    }
  })();
  return saving;
}

export function resetPaintSession() {
  materialsRequest++;
  usePaintStore.setState({ draft: null, enabled: false, cloneSource: null, materials: [], error: null });
}

export function blockPainting(blocked: boolean) {
  projectBlocks = Math.max(0, projectBlocks + (blocked ? 1 : -1));
  if (blocked) endPaintStroke();
  usePaintStore.setState({ blocked: projectBlocks > 0 });
}

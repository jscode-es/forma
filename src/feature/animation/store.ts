import { create } from "zustand";
import i18n from "@/lib/i18n";
import type { AnimationBone, AnimationClipData, AnimationLibraryItem, AnimationTrack, ModelSource, VideoSource } from "@/lib/forma";
import { displayedVariant, useProjectStore } from "@/stores/project-store";
import { enqueueTextMotion, enqueueVideoMotion } from "@/feature/jobs";
import { readAnimationModel, writeAnimationClip, createAnimationPreset, retargetAnimationClip, sampleAnimationTrack, eulerToQuaternion, quaternionToEuler, validateAnimationClip } from "./operations";

type Path = AnimationTrack["path"];
type Triple = [number, number, number];
type Source = { sessionId: string; variantId: string; label: string; bytes: Uint8Array; bones: AnimationBone[]; clips: AnimationClipData[] };
type State = {
  source: Source | null; sessionId: string | null; variantId: string | null; draft: AnimationClipData | null;
  library: AnimationLibraryItem[]; libraryId: string | null; selectedLibraryId: string | null; mapping: Record<string, string>; video: VideoSource | null;
  frame: number; playing: boolean; loop: boolean; speed: number; revision: number; busy: boolean; blocked: boolean; dirty: boolean; error: string | null; canUndo: boolean; canRedo: boolean;
};

export const useAnimationStore = create<State>()(() => ({ source: null, sessionId: null, variantId: null, draft: null, library: [], libraryId: null, selectedLibraryId: null, mapping: {}, video: null, frame: 0, playing: false, loop: true, speed: 1, revision: 0, busy: false, blocked: false, dirty: false, error: null, canUndo: false, canRedo: false }));
let past: string[] = [];
let future: string[] = [];
let baseline = "";
let blockCount = 0;
let saving: Promise<void> | null = null;

function errorState(error: unknown) { useAnimationStore.setState({ error: error instanceof Error ? error.message : "animation.failed" }); }
function editable() { const state = useAnimationStore.getState(); return !state.busy && !state.blocked; }
function sourceMatches(source: Source | null) {
  const project = useProjectStore.getState();
  return !!source && source.sessionId === project.sessionId && source.variantId === displayedVariant(project).id;
}
function clearHistory() { past = []; future = []; }
function publish(draft: AnimationClipData) {
  const serialized = JSON.stringify(draft);
  useAnimationStore.setState((state) => ({ draft, dirty: serialized !== baseline, canUndo: past.length > 0, canRedo: future.length > 0, revision: state.revision + 1, error: null, playing: false, frame: Math.min(state.frame, draft.durationFrames) }));
}
function mutate(change: (clip: AnimationClipData) => void) {
  const state = useAnimationStore.getState();
  if (!editable() || !state.draft) return;
  const before = JSON.stringify(state.draft);
  const clip = structuredClone(state.draft);
  change(clip);
  if (before === JSON.stringify(clip)) return;
  past.push(before); future = [];
  while (past.reduce((sum, entry) => sum + entry.length * 2, 0) > 64 * 1024 * 1024) past.shift();
  publish(clip);
}
function setDraft(clip: AnimationClipData, dirty = false) {
  clearHistory(); baseline = dirty ? "" : JSON.stringify(clip);
  publish(structuredClone(clip));
  useAnimationStore.setState({ frame: 0, libraryId: null });
}

export async function loadAnimationSource() {
  const state = useAnimationStore.getState();
  if (!editable()) return;
  if (state.dirty) { errorState(new Error("animation.pendingDraft")); return; }
  const project = useProjectStore.getState();
  const variant = displayedVariant(project);
  if (!window.forma || variant.model.type === "default-cube") { errorState(new Error("animation.modelRequired")); return; }
  const model = variant.model;
  const source: ModelSource | null = model.type === "staged" ? { type: "staged", stagingId: model.stagingId } : project.id ? { type: "asset", projectId: project.id, assetId: model.assetId } : null;
  if (!source) return;
  useAnimationStore.setState({ busy: true, error: null });
  project.retainVariant(variant.id);
  let retained = true;
  try {
    const bytes = await window.forma.models.read(source);
    const info = readAnimationModel(bytes);
    if (useProjectStore.getState().sessionId !== project.sessionId) return;
    if (state.source?.sessionId === project.sessionId) useProjectStore.getState().releaseVariant(state.source.variantId);
    const next: Source = { ...info, bytes, sessionId: project.sessionId, variantId: variant.id, label: variant.label };
    useAnimationStore.setState({ source: next, sessionId: next.sessionId, variantId: next.variantId, libraryId: null, mapping: {}, video: null });
    retained = false;
    setDraft(info.clips[0] ?? { version: 1, name: i18n.t("animation.newClip"), fps: 30, durationFrames: 60, bones: info.bones, tracks: [] });
  } catch (error) { if (useProjectStore.getState().sessionId === project.sessionId) errorState(error); }
  finally {
    if (retained && useProjectStore.getState().sessionId === project.sessionId) useProjectStore.getState().releaseVariant(variant.id);
    useAnimationStore.setState({ busy: false });
  }
}

export function selectSourceClip(index: number) {
  const state = useAnimationStore.getState();
  if (!editable() || state.dirty || !state.source?.clips[index]) return;
  setDraft(state.source.clips[index]);
}
export async function createPreset(kind: "idle" | "walk" | "run") {
  if (!editable()) return;
  const project = useProjectStore.getState();
  const source = useAnimationStore.getState().source;
  if (!source || source.variantId !== displayedVariant(project).id || source.sessionId !== project.sessionId) await loadAnimationSource();
  const state = useAnimationStore.getState();
  if (!sourceMatches(state.source)) return;
  if (!state.source || state.dirty || !editable()) { if (state.dirty) errorState(new Error("animation.pendingDraft")); return; }
  try { setDraft(createAnimationPreset(kind, state.source.bones), true); } catch (error) { errorState(error); }
}
export function setAnimationName(name: string) { if (name.trim() && name.length <= 120) mutate((clip) => { clip.name = name; }); }
export function setAnimationTiming(fps: number, durationFrames: number) {
  if (!Number.isInteger(fps) || fps < 1 || fps > 120 || !Number.isInteger(durationFrames) || durationFrames < 1 || durationFrames > 72000) return;
  if (useAnimationStore.getState().draft?.tracks.some((track) => track.keys.some((key) => key.frame > durationFrames))) { errorState(new Error("animation.keyOutsideRange")); return; }
  mutate((clip) => { clip.fps = fps; clip.durationFrames = durationFrames; });
}
export function getAnimationValues(bone: string, path: Path, frame: number): Triple {
  const clip = useAnimationStore.getState().draft;
  const rest = clip?.bones.find((entry) => entry.name === bone);
  const track = clip?.tracks.find((entry) => entry.bone === bone && entry.path === path);
  const values = track ? sampleAnimationTrack(track, frame) : rest?.[path] ?? (path === "rotation" ? [0, 0, 0, 1] : path === "scale" ? [1, 1, 1] : [0, 0, 0]);
  return path === "rotation" ? quaternionToEuler(values as [number, number, number, number]) : values.slice(0, 3) as Triple;
}
export function setAnimationKey(bone: string, path: Path, frame: number, values: Triple, interpolation: "LINEAR" | "STEP") {
  const clip = useAnimationStore.getState().draft;
  if (!clip?.bones.some((entry) => entry.name === bone) || !Number.isFinite(frame) || frame < 0 || frame > clip.durationFrames || values.some((value) => !Number.isFinite(value) || Math.abs(value) > 10000) || (path === "scale" && values.some((value) => value <= 0))) return;
  mutate((draft) => {
    let track = draft.tracks.find((entry) => entry.bone === bone && entry.path === path);
    if (!track) { track = { bone, path, interpolation, keys: [] }; draft.tracks.push(track); }
    track.interpolation = interpolation;
    track.keys = [...track.keys.filter((key) => key.frame !== frame), { frame, value: path === "rotation" ? eulerToQuaternion(values) : [...values] }].sort((a, b) => a.frame - b.frame);
  });
}
export function deleteAnimationKey(bone: string, path: Path, frame: number) { mutate((clip) => { clip.tracks = clip.tracks.map((track) => track.bone === bone && track.path === path ? { ...track, keys: track.keys.filter((key) => key.frame !== frame) } : track).filter((track) => track.keys.length); }); }
export function undoAnimation() { const state = useAnimationStore.getState(); if (!editable() || !state.draft || !past.length) return; future.push(JSON.stringify(state.draft)); publish(JSON.parse(past.pop()!)); }
export function redoAnimation() { const state = useAnimationStore.getState(); if (!editable() || !state.draft || !future.length) return; past.push(JSON.stringify(state.draft)); publish(JSON.parse(future.pop()!)); }
export function setAnimationPlayback(patch: Partial<Pick<State, "frame" | "playing" | "loop" | "speed">>) {
  const state = useAnimationStore.getState();
  if (!editable() || !state.draft) return;
  useAnimationStore.setState({ ...patch, frame: Math.max(0, Math.min(state.draft.durationFrames, patch.frame ?? state.frame)), speed: Math.max(.1, Math.min(4, patch.speed ?? state.speed)) });
}
export function recordAnimationFrame(frame: number, playing: boolean) { useAnimationStore.setState({ frame, playing }); }
export function hasAnimationChanges() { const state = useAnimationStore.getState(); return state.dirty && state.sessionId === useProjectStore.getState().sessionId; }
export function resumeAnimationSource() { const source = useAnimationStore.getState().source; if (source && editable() && source.sessionId === useProjectStore.getState().sessionId) useProjectStore.getState().previewVariant(source.variantId); }
export function discardAnimation() {
  if (useAnimationStore.getState().busy) return;
  const source = useAnimationStore.getState().source;
  if (source?.sessionId === useProjectStore.getState().sessionId) useProjectStore.getState().releaseVariant(source.variantId);
  resetAnimationSession();
}
export function resetAnimationSession() { clearHistory(); baseline = ""; useAnimationStore.setState({ source: null, sessionId: null, variantId: null, draft: null, libraryId: null, dirty: false, canUndo: false, canRedo: false, playing: false, frame: 0, error: null }); }
export function blockAnimation(blocked: boolean) { blockCount = Math.max(0, blockCount + (blocked ? 1 : -1)); useAnimationStore.setState({ blocked: blockCount > 0, playing: false }); }
export function saveAnimationVariant(): Promise<void> {
  if (saving) return saving;
  const state = useAnimationStore.getState();
  const source = state.source, clip = state.draft;
  if (!state.dirty || !source || !clip || source.sessionId !== useProjectStore.getState().sessionId) return Promise.resolve();
  useAnimationStore.setState({ busy: true, playing: false, error: null });
  saving = Promise.resolve().then(async () => {
    try {
      const bytes = writeAnimationClip(source.bytes, validateAnimationClip(clip));
      const model = await window.forma!.models.stageBytes(bytes, source.label);
      const project = useProjectStore.getState();
      if (project.sessionId !== source.sessionId || useAnimationStore.getState().source !== source) return;
      project.addVariant({ label: i18n.t("animation.variant", { name: source.label, clip: clip.name }), origin: "animation", engineId: null, model, lods: [], params: { clipName: clip.name, fps: clip.fps, durationFrames: clip.durationFrames } }, false, source.variantId);
      project.releaseVariant(source.variantId);
      resetAnimationSession();
    } catch (error) { if (useProjectStore.getState().sessionId === source.sessionId) errorState(error); throw error; }
    finally { useAnimationStore.setState({ busy: false }); saving = null; }
  });
  return saving;
}
export async function refreshAnimationLibrary() { if (window.forma) useAnimationStore.setState({ library: await window.forma.animations.list() }); }
export async function saveAnimationToLibrary() {
  const state = useAnimationStore.getState(); if (!editable() || !state.draft || !window.forma) return;
  useAnimationStore.setState({ busy: true, playing: false });
  try {
    const item = await window.forma.animations.save(state.libraryId, validateAnimationClip(state.draft));
    if (useAnimationStore.getState().source === state.source && useAnimationStore.getState().draft === state.draft) useAnimationStore.setState({ libraryId: item.id });
    await refreshAnimationLibrary();
  } catch (error) { if (useAnimationStore.getState().source === state.source) errorState(error); }
  finally { useAnimationStore.setState({ busy: false }); }
}
export async function loadLibraryAnimation(id: string) {
  if (!editable() || useAnimationStore.getState().dirty) { errorState(new Error("animation.pendingDraft")); return; }
  const project = useProjectStore.getState();
  if (useAnimationStore.getState().variantId !== displayedVariant(project).id || useAnimationStore.getState().sessionId !== project.sessionId) await loadAnimationSource();
  const source = useAnimationStore.getState().source;
  if (!source || !sourceMatches(source) || !window.forma) return;
  useAnimationStore.setState({ busy: true, playing: false });
  try {
    const clip = await window.forma.animations.read(id);
    if (useAnimationStore.getState().source !== source) return;
    const mapping = Object.fromEntries(clip.bones.map((bone) => [bone.name, bone.name]));
    setDraft(retargetAnimationClip(clip, source.bones, mapping), true);
    useAnimationStore.setState({ selectedLibraryId: id, mapping, libraryId: null });
  } catch (error) { if (useAnimationStore.getState().source === source) errorState(error); }
  finally { useAnimationStore.setState({ busy: false }); }
}
export function setAnimationMapping(sourceName: string, targetName: string) { useAnimationStore.setState((state) => ({ mapping: { ...state.mapping, [sourceName]: targetName } })); }
export async function retargetLibraryAnimation(id: string, mapping: Record<string, string>) {
  if (!editable() || useAnimationStore.getState().dirty) { errorState(new Error("animation.pendingDraft")); return; }
  const project = useProjectStore.getState();
  if (useAnimationStore.getState().variantId !== displayedVariant(project).id || useAnimationStore.getState().sessionId !== project.sessionId) await loadAnimationSource();
  const source = useAnimationStore.getState().source;
  if (!source || !sourceMatches(source) || !window.forma) return;
  useAnimationStore.setState({ busy: true, playing: false });
  try { const clip = await window.forma.animations.read(id); if (useAnimationStore.getState().source !== source) return; setDraft(retargetAnimationClip(clip, source.bones, mapping), true); useAnimationStore.setState({ selectedLibraryId: id, libraryId: null }); }
  catch (error) { if (useAnimationStore.getState().source === source) errorState(error); }
  finally { useAnimationStore.setState({ busy: false }); }
}
export async function deleteLibraryAnimation(id: string) { if (!window.forma) return; try { await window.forma.animations.delete(id); if (useAnimationStore.getState().libraryId === id) useAnimationStore.setState({ libraryId: null }); await refreshAnimationLibrary(); } catch (error) { errorState(error); } }
export async function importLibraryAnimation() { if (!window.forma) return; try { await window.forma.animations.import(); await refreshAnimationLibrary(); } catch (error) { errorState(error); } }
export async function exportLibraryAnimation(id: string) { if (!window.forma) return; try { await window.forma.animations.export(id); } catch (error) { errorState(error); } }
export async function chooseAnimationVideo() { if (!window.forma || !editable()) return; try { const video = await window.forma.videos.import(); if (video) useAnimationStore.setState({ video }); } catch (error) { errorState(error); } }
export async function generateVideoMotion() {
  if (!editable() || useAnimationStore.getState().dirty) { errorState(new Error("animation.pendingDraft")); return; }
  const { video } = useAnimationStore.getState();
  if (!video) return;
  await enqueueVideoMotion(video);
}
export async function generateTextMotion(provider: string, seconds: number, prompt: string) {
  if (!editable() || useAnimationStore.getState().dirty) { errorState(new Error("animation.pendingDraft")); return; }
  await enqueueTextMotion(provider, seconds, prompt);
}
export function acceptVideoMotion(clip: AnimationClipData, source: Source) {
  if (useProjectStore.getState().sessionId !== source.sessionId || useAnimationStore.getState().dirty) throw new Error("animation.pendingDraft");
  const previous = useAnimationStore.getState().source;
  if (previous?.sessionId === source.sessionId) useProjectStore.getState().releaseVariant(previous.variantId);
  useProjectStore.getState().retainVariant(source.variantId);
  useAnimationStore.setState({ source, sessionId: source.sessionId, variantId: source.variantId });
  setDraft(validateAnimationClip(clip), true);
}

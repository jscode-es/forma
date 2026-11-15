import { create } from "zustand";
import i18n from "@/lib/i18n";
import { recordMeshReport, recordUvTemplate } from "@/feature/mesh-tools";
import type { EngineInfo, EngineTask, HardwareInfo, ImageSource, JobInfo, LocalizedText, ReferenceView, SceneModel, VideoSource } from "@/lib/forma";
import { acceptVideoMotion, refreshAnimationLibrary, useAnimationStore, readAnimationModel, validateAnimationClip } from "@/feature/animation";
import { activeImage, activeVariant, displayedVariant, mainReference, useProjectStore } from "@/stores/project-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useSettingsStore } from "@/stores/settings-store";
import { scaleGlbToHeight } from "./scale";
import { parseMeshReport } from "./mesh-report";

export type MeshTask = Extract<EngineTask, "mesh-inspect" | "retopology" | "uv-unwrap" | "normals" | "ambient-occlusion">;
const MESH_ORIGINS = { retopology: "retopology", "uv-unwrap": "uv", normals: "normals", "ambient-occlusion": "occlusion" } as const;

type Target =
  | { kind: "model"; engineName: string }
  | { kind: "optimize"; budget: number }
  | { kind: "prepared"; referenceId: string }
  | { kind: "texture"; engineName: string; parentId: string }
  | { kind: "rig"; parentId: string; sourceLabel: string }
  | { kind: "motion"; parentId: string; sourceLabel: string }
  | { kind: "mesh"; task: MeshTask; parentIds: string[]; sourceLabel: string }
  | { kind: "candidates"; prompt: string; engineId: string }
  | { kind: "package"; variantId: string; target: PackageTarget; name: string };
type Pending = Target & { sessionId: string };

export type PackageTarget = "blender" | "unity" | "godot";

export type PackageJob = { jobId: string; sessionId: string; variantId: string; target: PackageTarget; name: string };

export type Candidates = {
  jobId: string;
  sessionId: string;
  prompt: string;
  engineId: string;
  files: { path: string; label: string; seed: number | null }[];
  picked: string | null;
};

type JobsState = {
  jobs: JobInfo[];
  engines: EngineInfo[];
  hardware: HardwareInfo | null;
  selectedId: string | null;
  pending: Record<string, Pending>;
  enqueueError: string | null;
  candidates: Candidates | null;
  lastPackage: PackageJob | null;
  select: (id: string | null) => void;
};

export const useJobsStore = create<JobsState>()((set) => ({
  jobs: [],
  engines: [],
  hardware: null,
  selectedId: null,
  pending: {},
  enqueueError: null,
  candidates: null,
  lastPackage: null,
  select: (selectedId) => set({ selectedId }),
}));

export const ACTIVE = new Set<JobInfo["status"]>(["queued", "running"]);

export function upsertJob(job: JobInfo) {
  useJobsStore.setState((s) => {
    const index = s.jobs.findIndex((j) => j.id === job.id);
    const jobs = index === -1 ? [job, ...s.jobs] : s.jobs.map((j) => (j.id === job.id ? job : j));
    return { jobs };
  });
}

export function localized(text: LocalizedText, language: string) {
  return language.startsWith("es") && text.es ? text.es : text.en;
}

export async function refreshEngines(refreshHardware = false) {
  const api = window.forma;
  if (!api) return;
  const [engines, hardware] = await Promise.all([api.engines.list(), api.system.hardware(refreshHardware)]);
  useJobsStore.setState({ engines, hardware });
}

export function selectDefaultEngines() {
  const { engines } = useJobsStore.getState();
  const project = useProjectStore.getState();
  const defaults: Partial<Pick<typeof project, "engine" | "imageEngine" | "textureEngine">> = {};
  for (const [key, task] of [["engine", "image-to-3d"], ["imageEngine", "text-to-image"], ["textureEngine", "texture"]] as const) {
    const supported = engines.filter((engine) => engine.tasks.includes(task));
    if (supported.some((engine) => engine.id === project[key].id)) continue;
    const engine = supported.find((entry) => entry.available && !entry.demo)
      ?? supported.find((entry) => entry.available)
      ?? supported.find((entry) => !entry.demo)
      ?? supported[0];
    if (engine) defaults[key] = { id: engine.id, parameters: {} };
  }
  if (Object.keys(defaults).length > 0) useProjectStore.setState(defaults);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
}

async function enqueue(
  task: EngineTask,
  engine: EngineInfo,
  parameters: JobInfo["parameters"],
  target: Target,
  models: SceneModel[] = [],
  prompt: string | null = null,
  videos: VideoSource[] = [],
) {
  const api = window.forma!;
  const project = useProjectStore.getState();
  let images: ImageSource[] = [];
  let views: ReferenceView[] = [];
  if (task === "remove-background" && target.kind === "prepared") {
    const reference = project.references.find((r) => r.id === target.referenceId);
    images = reference ? [reference.original] : [];
  } else if (task === "image-to-3d" && engine.inputs.views.length > 0) {
    const references = engine.inputs.views.flatMap((view) => {
      const reference = project.references.find((r) => r.view === view);
      return reference ? [reference] : [];
    }).slice(0, engine.inputs.images.max);
    images = references.map(activeImage);
    views = references.map((r) => r.view);
  } else if (task === "texture") {
    const reference = project.references.find((r) => r.id === project.textureReferenceId);
    images = reference ? [activeImage(reference)] : [];
    views = reference && engine.inputs.views.length > 0 ? [reference.view] : [];
  } else if (task !== "text-to-image" && engine.inputs.images.max > 0) {
    const reference = mainReference(project.references);
    images = reference ? [activeImage(reference)] : [];
  }
  const job = await api.jobs.enqueue({ engineId: engine.id, task, projectId: project.id, parameters, images, models, prompt, views, videos });
  upsertJob(job);
  useJobsStore.setState((s) => ({
    selectedId: job.id,
    enqueueError: null,
    pending: { ...s.pending, [job.id]: { ...target, sessionId: project.sessionId } },
  }));
  return job;
}

export async function generateModel() {
  const project = useProjectStore.getState();
  const engine = useJobsStore.getState().engines.find((e) => e.id === project.engine.id);
  if (!window.forma || !engine) return;
  const parameters = { ...project.engine.parameters };
  if (engine.parameters.some((p) => p.id === "steps") && parameters.steps === undefined) {
    parameters.steps = project.qualitySteps[project.quality];
  }
  try {
    await enqueue("image-to-3d", engine, parameters, { kind: "model", engineName: engine.name });
  } catch (error) {
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function generateImages() {
  const project = useProjectStore.getState();
  const engine = useJobsStore.getState().engines.find((e) => e.id === project.imageEngine.id);
  const prompt = project.prompt.trim();
  if (!window.forma || !engine || !prompt) return;
  const parameters = { ...project.imageEngine.parameters };
  if (engine.id === "sdxl-lightning" && engine.parameters.some((parameter) => parameter.id === "stylePrompt" && parameter.type === "string")) {
    parameters.stylePrompt = useSettingsStore.getState().sdxlStyle.trim();
  }
  try {
    const job = await enqueue("text-to-image", engine, parameters, { kind: "candidates", prompt, engineId: engine.id }, [], prompt);
    if (engine.network) useProjectStore.getState().setImageEngineParameter("consent", false);
    useProjectStore.getState().addPrompt({
      id: crypto.randomUUID(),
      text: prompt,
      engineId: engine.id,
      params: job.parameters,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function pickCandidate(path: string) {
  const candidates = useJobsStore.getState().candidates;
  const file = candidates?.files.find((f) => f.path === path);
  if (!window.forma || !candidates || !file) return;
  try {
    const reference = await window.forma.jobs.stageReference(candidates.jobId, path);
    if (useProjectStore.getState().sessionId !== candidates.sessionId) return;
    useProjectStore.getState().setReference({
      ...reference,
      name: candidates.prompt.slice(0, 120),
      prompt: { text: candidates.prompt, seed: file.seed, engineId: candidates.engineId },
    });
    useJobsStore.setState({ candidates: { ...candidates, picked: path }, enqueueError: null });
  } catch (error) {
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export function engineFor(task: EngineTask, preferredId?: string | null): EngineInfo | undefined {
  const { engines } = useJobsStore.getState();
  const supports = (e?: EngineInfo) => Boolean(e?.available && e.tasks.includes(task));
  const preferred = engines.find((e) => e.id === preferredId);
  if (supports(preferred)) return preferred;
  return engines.find((e) => supports(e) && !e.demo) ?? engines.find(supports);
}

export function backgroundEngine() {
  return engineFor("remove-background", useProjectStore.getState().engine.id);
}

export async function removeBackground(referenceId: string) {
  const engine = backgroundEngine();
  if (!window.forma || !engine) return;
  try {
    await enqueue("remove-background", engine, {}, { kind: "prepared", referenceId });
  } catch (error) {
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function optimizeModel(parameters: { budget: number; lod1: number; lod2: number; lod3: number }) {
  const engine = engineFor("optimize");
  const source = activeVariant(useProjectStore.getState()).model;
  if (!window.forma || !engine || source.type === "default-cube") return;
  try {
    await enqueue("optimize", engine, parameters, { kind: "optimize", budget: parameters.budget }, [source]);
  } catch (error) {
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function packageModel(target: PackageTarget, includeLods: boolean, tangents: boolean) {
  const project = useProjectStore.getState();
  const variant = activeVariant(project);
  const engine = engineFor("export-package");
  if (!window.forma || !engine || variant.model.type === "default-cube") return;
  try {
    const name = variant.label;
    await enqueue("export-package", engine, { target, tangents }, { kind: "package", variantId: variant.id, target, name }, [variant.model, ...(includeLods ? variant.lods : [])]);
  } catch (error) {
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function textureModel() {
  const project = useProjectStore.getState();
  const source = activeVariant(project);
  const engine = useJobsStore.getState().engines.find((e) => e.id === project.textureEngine.id && e.tasks.includes("texture"));
  if (!window.forma || !engine || source.model.type === "default-cube") return;
  if (!project.references.some((r) => r.id === project.textureReferenceId)) {
    useJobsStore.setState({ enqueueError: "reference-required" });
    return;
  }
  project.retainVariant(source.id);
  try {
    await enqueue("texture", engine, project.textureEngine.parameters, { kind: "texture", engineName: engine.name, parentId: source.id }, [source.model]);
  } catch (error) {
    if (useProjectStore.getState().sessionId === project.sessionId) useProjectStore.getState().releaseVariant(source.id);
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function enqueueMeshTask(task: MeshTask, parameters: JobInfo["parameters"], highVariantId?: string): Promise<void> {
  const project = useProjectStore.getState();
  const source = activeVariant(project);
  const engine = task === "retopology" ? useJobsStore.getState().engines.find((entry) => entry.id === "instant-meshes" && entry.available) : engineFor(task);
  if (!window.forma || !engine) return;
  const high = highVariantId ? project.variants.find((v) => v.id === highVariantId) : undefined;
  if (source.model.type === "default-cube" || (task === "normals" && parameters.mode === "bake" && (!high || high.id === source.id || high.model.type === "default-cube"))) {
    useJobsStore.setState({ enqueueError: "model-required" });
    return;
  }
  const parents = [source.id, ...(task === "normals" && parameters.mode === "bake" && high ? [high.id] : [])];
  parents.forEach(project.retainVariant);
  try {
    await enqueue(task, engine, parameters, { kind: "mesh", task, parentIds: parents, sourceLabel: source.label }, [source.model, ...(parents[1] && high ? [high.model] : [])]);
  } catch (error) {
    if (useProjectStore.getState().sessionId === project.sessionId) parents.forEach((id) => useProjectStore.getState().releaseVariant(id));
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function enqueueRigTask(parameters: JobInfo["parameters"]): Promise<void> {
  const project = useProjectStore.getState();
  const source = displayedVariant(project);
  const engine = useJobsStore.getState().engines.find((entry) => entry.id === "forma-blender-rig" && entry.available);
  if (!window.forma || !engine || source.model.type === "default-cube") return;
  project.retainVariant(source.id);
  try {
    await enqueue("rig", engine, parameters, { kind: "rig", parentId: source.id, sourceLabel: source.label }, [source.model]);
  } catch (error) {
    if (useProjectStore.getState().sessionId === project.sessionId) useProjectStore.getState().releaseVariant(source.id);
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function enqueueVideoMotion(video: VideoSource) {
  const project = useProjectStore.getState();
  const source = displayedVariant(project);
  const engine = useJobsStore.getState().engines.find((entry) => entry.tasks.includes("video-to-motion") && entry.available);
  if (!window.forma || !engine || source.model.type === "default-cube") return;
  project.retainVariant(source.id);
  try { await enqueue("video-to-motion", engine, {}, { kind: "motion", parentId: source.id, sourceLabel: source.label }, [source.model], null, [video]); }
  catch (error) {
    if (useProjectStore.getState().sessionId === project.sessionId) useProjectStore.getState().releaseVariant(source.id);
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function enqueueTextMotion(provider: string, seconds: number, prompt: string) {
  const project = useProjectStore.getState();
  const source = displayedVariant(project);
  const engine = useJobsStore.getState().engines.find((entry) => entry.tasks.includes("text-to-motion") && entry.available);
  if (!window.forma || !engine || source.model.type === "default-cube") return;
  project.retainVariant(source.id);
  try {
    await enqueue("text-to-motion", engine, { provider, seconds, consent: true }, { kind: "motion", parentId: source.id, sourceLabel: source.label }, [source.model], prompt);
  } catch (error) {
    if (useProjectStore.getState().sessionId === project.sessionId) useProjectStore.getState().releaseVariant(source.id);
    useJobsStore.setState({ enqueueError: errorMessage(error) });
  }
}

export async function applyFinishedJob(job: JobInfo) {
  const { pending } = useJobsStore.getState();
  const target = pending[job.id];
  if (!target || ACTIVE.has(job.status)) return;
  const rest = { ...pending };
  delete rest[job.id];
  useJobsStore.setState({ pending: rest });

  const project = useProjectStore.getState();
  if (target.sessionId !== project.sessionId) return;
  if (target.kind === "motion") {
    try {
      if (job.status === "failed") { useJobsStore.setState({ selectedId: job.id }); useWorkspaceStore.getState().setDockTab("process"); }
      if (job.status !== "succeeded") return;
      const file = job.results.find((entry) => entry.kind === "animation-clip");
      if (!file) throw new Error("animation.invalidClip");
      const bytes = await window.forma!.jobs.readFile(job.id, file.path);
      if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("animation.invalidClip");
      const clip = validateAnimationClip(JSON.parse(new TextDecoder().decode(bytes)));
      await window.forma!.animations.save(null, clip);
      await refreshAnimationLibrary();
      const model = await window.forma!.jobs.readFile(job.id, "in/model-0.glb");
      if (useProjectStore.getState().sessionId !== target.sessionId) return;
      if (useAnimationStore.getState().dirty) { useJobsStore.setState({ enqueueError: "animation.pendingDraft" }); return; }
      acceptVideoMotion(clip, { bytes: model, ...readAnimationModel(model), sessionId: target.sessionId, variantId: target.parentId, label: target.sourceLabel });
    } finally {
      if (useProjectStore.getState().sessionId === target.sessionId) useProjectStore.getState().releaseVariant(target.parentId);
    }
    return;
  }
  if (target.kind === "rig") {
    try {
      if (job.status === "failed") {
        useJobsStore.setState({ selectedId: job.id });
        useWorkspaceStore.getState().setDockTab("process");
      }
      if (job.status !== "succeeded") return;
      const model = await window.forma!.jobs.stageResult(job.id);
      const current = useProjectStore.getState();
      if (current.sessionId !== target.sessionId) return;
      current.addVariant({ label: i18n.t(job.parameters.mode === "edit" ? "rigging.editedVariant" : "rigging.variant", { name: target.sourceLabel }), origin: "rig", engineId: job.engineId, model, lods: [], params: job.parameters }, false, target.parentId);
    } finally {
      if (useProjectStore.getState().sessionId === target.sessionId) useProjectStore.getState().releaseVariant(target.parentId);
    }
    return;
  }
  if (target.kind === "mesh") {
    try {
      if (job.status === "failed") {
        useJobsStore.setState({ selectedId: job.id });
        useWorkspaceStore.getState().setDockTab("process");
      }
      if (job.status !== "succeeded") return;
      const file = job.results.find((item) => item.kind === "mesh-report");
      if (!file) throw new Error("mesh-report-invalid");
      const report = parseMeshReport(await window.forma!.jobs.readFile(job.id, file.path), target.task);
      const model = target.task === "mesh-inspect" ? null : await window.forma!.jobs.stageResult(job.id);
      const current = useProjectStore.getState();
      if (current.sessionId !== target.sessionId) return;
      recordMeshReport(target.parentIds[0], { sessionId: target.sessionId, jobId: job.id, report });
      let resultVariantId: string | undefined;
      if (model && target.task !== "mesh-inspect") {
        const origin = MESH_ORIGINS[target.task];
        current.addVariant({ label: i18n.t(`mesh.variant.${origin}`, { name: target.sourceLabel }), origin, engineId: job.engineId, model, lods: [], params: { ...job.parameters, ...(target.parentIds[1] ? { highVariantId: target.parentIds[1] } : {}) } }, false, target.parentIds[0]);
        resultVariantId = useProjectStore.getState().previewVariantId ?? undefined;
      }
      const template = job.results.find((item) => item.kind === "uv-template");
      if (template) recordUvTemplate({ sessionId: target.sessionId, jobId: job.id, path: template.path, variantId: target.parentIds[0], resultVariantId });
    } finally {
      if (useProjectStore.getState().sessionId === target.sessionId) target.parentIds.forEach((id) => useProjectStore.getState().releaseVariant(id));
    }
    return;
  }
  if (target.kind === "texture") {
    try {
      if (job.status === "failed") {
        useJobsStore.setState({ selectedId: job.id });
        useWorkspaceStore.getState().setDockTab("process");
      }
      if (job.status !== "succeeded") return;
      const model = await window.forma!.jobs.stageResult(job.id);
      const current = useProjectStore.getState();
      if (current.sessionId !== target.sessionId) return;
      current.addVariant({ label: target.engineName, origin: "texture", engineId: job.engineId, model, lods: [], params: job.parameters }, false, target.parentId);
    } finally {
      if (useProjectStore.getState().sessionId === target.sessionId) useProjectStore.getState().releaseVariant(target.parentId);
    }
    return;
  }
  if (job.status === "failed") {
    useJobsStore.setState({ selectedId: job.id });
    useWorkspaceStore.getState().setDockTab("process");
    return;
  }
  if (job.status !== "succeeded") return;
  const api = window.forma!;

  if (target.kind === "candidates") {
    const files = job.results
      .filter((r) => r.kind === "image")
      .map((r) => ({ path: r.path, label: r.label, seed: typeof r.meta?.seed === "number" ? r.meta.seed : null }));
    useJobsStore.setState({
      candidates: { jobId: job.id, sessionId: target.sessionId, prompt: target.prompt, engineId: target.engineId, files, picked: null },
    });
    return;
  }

  if (target.kind === "prepared") {
    const prepared = await api.jobs.stageImage(job.id);
    if (useProjectStore.getState().sessionId !== target.sessionId) return;
    useProjectStore.getState().updateReference(target.referenceId, { prepared, usePrepared: true });
    return;
  }

  if (target.kind === "package") {
    useJobsStore.setState({ lastPackage: { jobId: job.id, sessionId: target.sessionId, variantId: target.variantId, target: target.target, name: target.name } });
    return;
  }

  if (target.kind === "optimize") {
    const model = await api.jobs.stageResult(job.id);
    const lods = await Promise.all(job.results.filter((r) => r.kind === "lod").map((r) => api.jobs.stageFile(job.id, r.path)));
    if (useProjectStore.getState().sessionId !== target.sessionId) return;
    useProjectStore.getState().addVariant(
      { label: `${activeVariant(project).label} · ${target.budget}`, origin: "optimize", engineId: job.engineId, model, lods, params: job.parameters },
      false,
    );
    return;
  }

  let model = await api.jobs.stageResult(job.id);
  if (project.physicalScale && model.type === "staged") {
    const bytes = await api.models.read({ type: "staged", stagingId: model.stagingId });
    model = await api.models.stageBytes(await scaleGlbToHeight(bytes, project.heightMeters), model.name);
  }
  if (useProjectStore.getState().sessionId !== target.sessionId) return;
  useProjectStore.getState().addVariant(
    { label: target.engineName, origin: "generation", engineId: job.engineId, model, lods: [], params: job.parameters },
    false,
  );
}

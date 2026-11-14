import { create } from "zustand";
import type { EngineInfo, EngineTask, HardwareInfo, JobInfo, LocalizedText, SceneModel } from "@/lib/forma";
import { activeImage, activeVariant, useProjectStore } from "@/stores/project-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { scaleGlbToHeight } from "./scale";

type Target =
  | { kind: "model"; engineName: string }
  | { kind: "optimize"; budget: number }
  | { kind: "prepared"; referenceId: string };
type Pending = Target & { sessionId: string };

type JobsState = {
  jobs: JobInfo[];
  engines: EngineInfo[];
  hardware: HardwareInfo | null;
  selectedId: string | null;
  pending: Record<string, Pending>;
  enqueueError: string | null;
  select: (id: string | null) => void;
};

export const useJobsStore = create<JobsState>()((set) => ({
  jobs: [],
  engines: [],
  hardware: null,
  selectedId: null,
  pending: {},
  enqueueError: null,
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

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
}

async function enqueue(
  task: EngineTask,
  engine: EngineInfo,
  parameters: JobInfo["parameters"],
  target: Target,
  models: SceneModel[] = [],
) {
  const api = window.forma!;
  const project = useProjectStore.getState();
  const reference = project.references[0];
  const images =
    engine.inputs.images.max > 0 && reference ? [task === "remove-background" ? reference.original : activeImage(reference)] : [];
  const job = await api.jobs.enqueue({ engineId: engine.id, task, projectId: project.id, parameters, images, models });
  upsertJob(job);
  useJobsStore.setState((s) => ({
    selectedId: job.id,
    enqueueError: null,
    pending: { ...s.pending, [job.id]: { ...target, sessionId: project.sessionId } },
  }));
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

export async function applyFinishedJob(job: JobInfo) {
  const { pending } = useJobsStore.getState();
  const target = pending[job.id];
  if (!target || ACTIVE.has(job.status)) return;
  const rest = { ...pending };
  delete rest[job.id];
  useJobsStore.setState({ pending: rest });

  const project = useProjectStore.getState();
  if (target.sessionId !== project.sessionId) return;
  if (job.status === "failed") {
    useJobsStore.setState({ selectedId: job.id });
    useWorkspaceStore.getState().setDockTab("process");
    return;
  }
  if (job.status !== "succeeded") return;
  const api = window.forma!;

  if (target.kind === "prepared") {
    const prepared = await api.jobs.stageImage(job.id);
    useProjectStore.getState().updateReference(target.referenceId, { prepared, usePrepared: true });
    return;
  }

  if (target.kind === "optimize") {
    const model = await api.jobs.stageResult(job.id);
    const lods = await Promise.all(job.results.filter((r) => r.kind === "lod").map((r) => api.jobs.stageFile(job.id, r.path)));
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
  useProjectStore.getState().addVariant(
    { label: target.engineName, origin: "generation", engineId: job.engineId, model, lods: [], params: job.parameters },
    false,
  );
}

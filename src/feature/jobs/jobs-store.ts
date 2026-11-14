import { create } from "zustand";
import type { EngineInfo, EngineTask, HardwareInfo, JobInfo, LocalizedText } from "@/lib/forma";
import { activeImage, QUALITY_STEPS, useProjectStore } from "@/stores/project-store";
import { scaleGlbToHeight } from "./scale";

type Target = { kind: "model" } | { kind: "prepared"; referenceId: string };
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

function message(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
}

async function enqueue(task: EngineTask, engine: EngineInfo, parameters: JobInfo["parameters"], target: Target) {
  const api = window.forma!;
  const project = useProjectStore.getState();
  const reference = project.references[0];
  const images = engine.inputs.images.max > 0 && reference ? [task === "remove-background" ? reference.original : activeImage(reference)] : [];
  const job = await api.jobs.enqueue({ engineId: engine.id, task, projectId: project.id, parameters, images });
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
    parameters.steps = QUALITY_STEPS[project.quality];
  }
  try {
    await enqueue("image-to-3d", engine, parameters, { kind: "model" });
  } catch (error) {
    useJobsStore.setState({ enqueueError: message(error) });
  }
}

export function backgroundEngine(): EngineInfo | undefined {
  const { engines } = useJobsStore.getState();
  const selected = engines.find((e) => e.id === useProjectStore.getState().engine.id);
  const supports = (e?: EngineInfo) => e?.available && e.tasks.includes("remove-background");
  if (supports(selected)) return selected;
  return engines.find((e) => supports(e) && !e.demo) ?? engines.find(supports);
}

export async function removeBackground(referenceId: string) {
  const engine = backgroundEngine();
  if (!window.forma || !engine) return;
  try {
    await enqueue("remove-background", engine, {}, { kind: "prepared", referenceId });
  } catch (error) {
    useJobsStore.setState({ enqueueError: message(error) });
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
  if (job.status !== "succeeded" || target.sessionId !== project.sessionId) return;
  const api = window.forma!;

  if (target.kind === "prepared") {
    const prepared = await api.jobs.stageImage(job.id);
    useProjectStore.getState().updateReference(target.referenceId, { prepared, usePrepared: true });
    return;
  }

  let model = await api.jobs.stageResult(job.id);
  if (project.physicalScale && model.type === "staged") {
    const bytes = await api.models.read({ type: "staged", stagingId: model.stagingId });
    model = await api.models.stageBytes(await scaleGlbToHeight(bytes, project.heightMeters), model.name);
  }
  useProjectStore.getState().setModel(model);
}

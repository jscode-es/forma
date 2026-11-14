import { create } from "zustand";
import type { EngineInfo, HardwareInfo, JobInfo, LocalizedText } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";

type JobsState = {
  jobs: JobInfo[];
  engines: EngineInfo[];
  hardware: HardwareInfo | null;
  selectedId: string | null;
  pendingApply: Record<string, string>;
  enqueueError: string | null;
  select: (id: string | null) => void;
};

export const useJobsStore = create<JobsState>()((set) => ({
  jobs: [],
  engines: [],
  hardware: null,
  selectedId: null,
  pendingApply: {},
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

export async function generateModel() {
  const api = window.forma;
  const project = useProjectStore.getState();
  if (!api || !project.engine.id) return;
  try {
    const job = await api.jobs.enqueue({
      engineId: project.engine.id,
      task: "image-to-3d",
      projectId: project.id,
      parameters: project.engine.parameters,
    });
    upsertJob(job);
    useJobsStore.setState((s) => ({
      selectedId: job.id,
      enqueueError: null,
      pendingApply: { ...s.pendingApply, [job.id]: project.sessionId },
    }));
  } catch (error) {
    useJobsStore.setState({ enqueueError: error instanceof Error ? error.message : String(error) });
  }
}

export async function applyFinishedJob(job: JobInfo) {
  const { pendingApply } = useJobsStore.getState();
  const session = pendingApply[job.id];
  if (!session || ACTIVE.has(job.status)) return;
  const rest = { ...pendingApply };
  delete rest[job.id];
  useJobsStore.setState({ pendingApply: rest });
  if (job.status !== "succeeded" || session !== useProjectStore.getState().sessionId) return;
  const model = await window.forma!.jobs.stageResult(job.id);
  useProjectStore.getState().setModel(model);
}

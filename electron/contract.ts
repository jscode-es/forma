export type Quality = "fast" | "balanced" | "high";

export type ParameterValue = number | boolean | string;

export type EngineSelection = { id: string | null; parameters: Record<string, ParameterValue> };

export type ProjectSettings = {
  quality: Quality;
  physicalScale: boolean;
  heightMeters: number;
  engine: EngineSelection;
};

export type SceneModel =
  | { type: "default-cube" }
  | { type: "asset"; assetId: string; name: string }
  | { type: "staged"; stagingId: string; name: string };

export type ProjectScene = { model: SceneModel };

export type ModelSource = { type: "staged"; stagingId: string } | { type: "asset"; projectId: string; assetId: string };

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = ProjectSummary & { settings: ProjectSettings; scene: ProjectScene };

export type ProjectInput = { name: string; settings: ProjectSettings; scene: ProjectScene };

export type SystemInfo = {
  version: string;
  platform: string;
  gpu: string | null;
  dataDir: string;
};

export type HardwareInfo = {
  gpu: string | null;
  vramMb: number | null;
  driver: string | null;
  cuda: string | null;
  diskFreeBytes: number | null;
  python: { path: string; version: string } | null;
};

export type LocalizedText = { en: string; es?: string };

export type EngineTask = "image-to-3d" | "text-to-3d" | "texture" | "rig" | "animation";

export type EngineParameter =
  | { id: string; type: "integer" | "number"; label: LocalizedText; min: number; max: number; step?: number; default: number }
  | { id: string; type: "boolean"; label: LocalizedText; default: boolean }
  | { id: string; type: "enum"; label: LocalizedText; options: { value: string; label: LocalizedText }[]; default: string };

export type EngineInfo = {
  id: string;
  name: string;
  version: string;
  license: string;
  description: LocalizedText;
  tasks: EngineTask[];
  parameters: EngineParameter[];
  requirements: { vramGb: number; cuda: boolean; python: boolean };
  builtin: boolean;
  demo: boolean;
  available: boolean;
  problem: string | null;
};

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JobFile = { path: string; label: string; kind: string };

export type JobInfo = {
  id: string;
  engineId: string;
  task: EngineTask;
  projectId: string | null;
  status: JobStatus;
  progress: number;
  stage: string | null;
  error: string | null;
  parameters: Record<string, ParameterValue>;
  intermediates: JobFile[];
  results: JobFile[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobRequest = {
  engineId: string;
  task: EngineTask;
  projectId: string | null;
  parameters: Record<string, ParameterValue>;
};

export type IpcChannels = {
  "projects:list": { args: []; result: ProjectSummary[] };
  "projects:create": { args: [ProjectInput]; result: Project };
  "projects:update": { args: [string, ProjectInput]; result: Project };
  "projects:open": { args: [string]; result: Project };
  "projects:last": { args: []; result: Project | null };
  "projects:rename": { args: [string, string]; result: ProjectSummary };
  "projects:duplicate": { args: [string, string]; result: ProjectSummary };
  "projects:delete": { args: [string]; result: void };
  "models:import": { args: []; result: SceneModel | null };
  "models:read": { args: [ModelSource]; result: Uint8Array };
  "engines:list": { args: []; result: EngineInfo[] };
  "jobs:list": { args: []; result: JobInfo[] };
  "jobs:enqueue": { args: [JobRequest]; result: JobInfo };
  "jobs:cancel": { args: [string]; result: void };
  "jobs:retry": { args: [string]; result: JobInfo };
  "jobs:logs": { args: [string]; result: string };
  "jobs:stage-result": { args: [string]; result: SceneModel };
  "system:info": { args: []; result: SystemInfo };
  "system:hardware": { args: [boolean]; result: HardwareInfo };
  "system:open-data-dir": { args: []; result: void };
  "app:set-dirty": { args: [boolean]; result: void };
  "app:confirm-close": { args: []; result: void };
};

export type IpcChannel = keyof IpcChannels;

export type IpcEvents = {
  "app:close-requested": [];
  "jobs:update": [JobInfo];
};

export type FormaApi = {
  projects: {
    list: () => Promise<ProjectSummary[]>;
    create: (input: ProjectInput) => Promise<Project>;
    update: (id: string, input: ProjectInput) => Promise<Project>;
    open: (id: string) => Promise<Project>;
    last: () => Promise<Project | null>;
    rename: (id: string, name: string) => Promise<ProjectSummary>;
    duplicate: (id: string, name: string) => Promise<ProjectSummary>;
    delete: (id: string) => Promise<void>;
  };
  models: {
    import: () => Promise<SceneModel | null>;
    read: (source: ModelSource) => Promise<Uint8Array>;
  };
  engines: {
    list: () => Promise<EngineInfo[]>;
  };
  jobs: {
    list: () => Promise<JobInfo[]>;
    enqueue: (request: JobRequest) => Promise<JobInfo>;
    cancel: (id: string) => Promise<void>;
    retry: (id: string) => Promise<JobInfo>;
    logs: (id: string) => Promise<string>;
    stageResult: (id: string) => Promise<SceneModel>;
    onUpdate: (callback: (job: JobInfo) => void) => () => void;
  };
  system: {
    info: () => Promise<SystemInfo>;
    hardware: (refresh: boolean) => Promise<HardwareInfo>;
    openDataDir: () => Promise<void>;
  };
  app: {
    setDirty: (dirty: boolean) => Promise<void>;
    confirmClose: () => Promise<void>;
    onCloseRequested: (callback: () => void) => () => void;
  };
};

export type Quality = "fast" | "balanced" | "high";

export type ParameterValue = number | boolean | string;

export type EngineSelection = { id: string | null; parameters: Record<string, ParameterValue> };

export type QualitySteps = Record<Quality, number>;

export type ProjectSettings = {
  quality: Quality;
  qualitySteps: QualitySteps;
  physicalScale: boolean;
  heightMeters: number;
  engine: EngineSelection;
};

export type SceneModel =
  | { type: "default-cube" }
  | { type: "asset"; assetId: string; name: string }
  | { type: "staged"; stagingId: string; name: string };

export type ImageSource = { type: "staged"; stagingId: string } | { type: "asset"; assetId: string };

export type ReferenceImage = {
  id: string;
  name: string;
  width: number;
  height: number;
  original: ImageSource;
  prepared: ImageSource | null;
  usePrepared: boolean;
};

export type VariantOrigin = "default" | "import" | "generation" | "optimize";

export type Variant = {
  id: string;
  label: string;
  origin: VariantOrigin;
  parentId: string | null;
  engineId: string | null;
  model: SceneModel;
  lods: SceneModel[];
  params: Record<string, ParameterValue>;
  createdAt: string;
  sha256: string | null;
  triangles: number | null;
};

export type ProjectScene = { references: ReferenceImage[]; variants: Variant[]; activeVariantId: string };

export type ModelSource = { type: "staged"; stagingId: string } | { type: "asset"; projectId: string; assetId: string };

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = ProjectSummary & { settings: ProjectSettings; scene: ProjectScene };

export type ProjectInput = { name: string; settings: ProjectSettings; scene: ProjectScene };

export type ExportResult = { path: string; sha256: string; size: number };

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

export type EngineTask = "image-to-3d" | "text-to-3d" | "remove-background" | "optimize" | "texture" | "rig" | "animation";

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
  inputs: { images: { min: number; max: number }; models: { min: number; max: number } };
  builtin: boolean;
  demo: boolean;
  available: boolean;
  problem: string | null;
};

export type WeightsSource = { type: "huggingface" | "github"; repo: string; revision: string };

export type LicenseInfo = { id: string; name: string; url: string; summary: LocalizedText };

export type WeightsFile = { path: string; size: number; sha256: string };

export type WeightsStatus = "missing" | "partial" | "downloading" | "verifying" | "installed" | "corrupt";

export type WeightsState = {
  id: string;
  name: string;
  engineId: string;
  engineName: string;
  optional: boolean;
  vramGb: number;
  license: LicenseInfo;
  source: WeightsSource;
  files: WeightsFile[];
  sizeBytes: number;
  status: WeightsStatus;
  downloadedBytes: number;
  licenseAccepted: boolean;
  error: string | null;
  latestRevision: string | null;
};

export type PluginState = {
  id: string;
  name: string;
  version: string;
  description: LocalizedText;
  license: string;
  licenseNotice: LocalizedText | null;
  weights: { id: string; name: string; license: LicenseInfo }[];
  requirements: { vramGb: number; cuda: boolean; python: string; diskGb: number };
  status: "available" | "installing" | "installed" | "outdated" | "failed";
  stage: string | null;
  progress: number | null;
  error: string | null;
  log: string[];
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
  images: ImageSource[];
  models: SceneModel[];
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
  "models:stage-bytes": { args: [Uint8Array, string]; result: SceneModel };
  "models:export": { args: [ModelSource | null, Uint8Array | null, string]; result: ExportResult | null };
  "references:import": { args: []; result: ReferenceImage | null };
  "references:read": { args: [ImageSource, string | null]; result: Uint8Array };
  "engines:list": { args: []; result: EngineInfo[] };
  "plugins:list": { args: []; result: PluginState[] };
  "plugins:install": { args: [string, string | null]; result: void };
  "plugins:cancel": { args: [string]; result: void };
  "plugins:uninstall": { args: [string]; result: PluginState };
  "plugins:choose-python": { args: []; result: string | null };
  "weights:list": { args: []; result: WeightsState[] };
  "weights:accept-license": { args: [string]; result: WeightsState };
  "weights:download": { args: [string]; result: void };
  "weights:cancel": { args: [string]; result: void };
  "weights:verify": { args: [string]; result: WeightsState };
  "weights:remove": { args: [string]; result: WeightsState };
  "weights:check-updates": { args: []; result: WeightsState[] };
  "jobs:list": { args: []; result: JobInfo[] };
  "jobs:enqueue": { args: [JobRequest]; result: JobInfo };
  "jobs:cancel": { args: [string]; result: void };
  "jobs:retry": { args: [string]; result: JobInfo };
  "jobs:logs": { args: [string]; result: string };
  "jobs:stage-result": { args: [string]; result: SceneModel };
  "jobs:stage-image": { args: [string]; result: ImageSource };
  "jobs:stage-file": { args: [string, string]; result: SceneModel };
  "jobs:read-file": { args: [string, string]; result: Uint8Array };
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
  "weights:update": [WeightsState];
  "plugins:update": [PluginState];
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
    stageBytes: (bytes: Uint8Array, name: string) => Promise<SceneModel>;
    export: (source: ModelSource | null, bytes: Uint8Array | null, name: string) => Promise<ExportResult | null>;
  };
  references: {
    import: () => Promise<ReferenceImage | null>;
    read: (source: ImageSource, projectId: string | null) => Promise<Uint8Array>;
  };
  engines: {
    list: () => Promise<EngineInfo[]>;
  };
  plugins: {
    list: () => Promise<PluginState[]>;
    install: (id: string, python: string | null) => Promise<void>;
    cancel: (id: string) => Promise<void>;
    uninstall: (id: string) => Promise<PluginState>;
    choosePython: () => Promise<string | null>;
    onUpdate: (callback: (state: PluginState) => void) => () => void;
  };
  weights: {
    list: () => Promise<WeightsState[]>;
    acceptLicense: (id: string) => Promise<WeightsState>;
    download: (id: string) => Promise<void>;
    cancel: (id: string) => Promise<void>;
    verify: (id: string) => Promise<WeightsState>;
    remove: (id: string) => Promise<WeightsState>;
    checkUpdates: () => Promise<WeightsState[]>;
    onUpdate: (callback: (state: WeightsState) => void) => () => void;
  };
  jobs: {
    list: () => Promise<JobInfo[]>;
    enqueue: (request: JobRequest) => Promise<JobInfo>;
    cancel: (id: string) => Promise<void>;
    retry: (id: string) => Promise<JobInfo>;
    logs: (id: string) => Promise<string>;
    stageResult: (id: string) => Promise<SceneModel>;
    stageImage: (id: string) => Promise<ImageSource>;
    stageFile: (id: string, path: string) => Promise<SceneModel>;
    readFile: (id: string, path: string) => Promise<Uint8Array>;
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

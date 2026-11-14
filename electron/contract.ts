export type Quality = "fast" | "balanced" | "high";

export type ProjectSettings = {
  quality: Quality;
  physicalScale: boolean;
  heightMeters: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = ProjectSummary & { settings: ProjectSettings };

export type ProjectInput = { name: string; settings: ProjectSettings };

export type SystemInfo = {
  version: string;
  platform: string;
  gpu: string | null;
  dataDir: string;
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
  "system:info": { args: []; result: SystemInfo };
  "system:open-data-dir": { args: []; result: void };
  "app:set-dirty": { args: [boolean]; result: void };
  "app:confirm-close": { args: []; result: void };
};

export type IpcChannel = keyof IpcChannels;

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
  system: {
    info: () => Promise<SystemInfo>;
    openDataDir: () => Promise<void>;
  };
  app: {
    setDirty: (dirty: boolean) => Promise<void>;
    confirmClose: () => Promise<void>;
    onCloseRequested: (callback: () => void) => () => void;
  };
};

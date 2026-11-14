export type Project = { id: number; name: string; createdAt: string };

export type SystemInfo = {
  version: string;
  platform: string;
  gpu: string | null;
  dataDir: string;
};

type FormaApi = {
  projects: {
    list: () => Promise<Project[]>;
    create: (name: string) => Promise<Project>;
  };
  system: {
    info: () => Promise<SystemInfo>;
    openDataDir: () => Promise<void>;
  };
};

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

export {};

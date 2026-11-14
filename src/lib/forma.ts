export type Project = { id: number; name: string; createdAt: string };

type FormaApi = {
  projects: {
    list: () => Promise<Project[]>;
    create: (name: string) => Promise<Project>;
  };
};

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

export {};

import type { FormaApi } from "../../electron/contract";

export type {
  FormaApi,
  ModelSource,
  Project,
  ProjectInput,
  ProjectScene,
  ProjectSettings,
  ProjectSummary,
  Quality,
  SceneModel,
  SystemInfo,
} from "../../electron/contract";

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

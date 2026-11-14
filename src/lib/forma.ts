import type { FormaApi } from "../../electron/contract";

export type {
  FormaApi,
  Project,
  ProjectInput,
  ProjectSettings,
  ProjectSummary,
  Quality,
  SystemInfo,
} from "../../electron/contract";

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

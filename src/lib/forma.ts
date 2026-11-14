import type { FormaApi } from "../../electron/contract";

export type {
  EngineInfo,
  EngineParameter,
  EngineSelection,
  FormaApi,
  HardwareInfo,
  JobInfo,
  LocalizedText,
  ModelSource,
  ParameterValue,
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

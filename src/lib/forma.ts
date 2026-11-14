import type { FormaApi } from "../../electron/contract";

export type {
  EngineInfo,
  EngineParameter,
  EngineSelection,
  FormaApi,
  HardwareInfo,
  JobInfo,
  LicenseInfo,
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
  WeightsState,
} from "../../electron/contract";

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

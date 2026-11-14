import type { FormaApi } from "../../electron/contract";

export type {
  EngineInfo,
  EngineParameter,
  EngineSelection,
  EngineTask,
  FormaApi,
  HardwareInfo,
  ImageSource,
  JobFile,
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
  ReferenceImage,
  SceneModel,
  SystemInfo,
  WeightsState,
} from "../../electron/contract";

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

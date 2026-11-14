import type { FormaApi } from "../../electron/contract";

export type {
  EngineInfo,
  EngineParameter,
  EngineSelection,
  EngineTask,
  ExportResult,
  FormaApi,
  HardwareInfo,
  ImageSource,
  JobFile,
  JobInfo,
  LicenseInfo,
  LocalizedText,
  ModelSource,
  ParameterValue,
  PluginState,
  Project,
  ProjectInput,
  ProjectScene,
  ProjectSettings,
  ProjectSummary,
  PromptEntry,
  Quality,
  QualitySteps,
  ReferenceImage,
  SceneModel,
  SystemInfo,
  Variant,
  WeightsState,
} from "../../electron/contract";

declare global {
  interface Window {
    forma?: FormaApi;
  }
}

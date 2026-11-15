import type { FormaApi } from "../../electron/contract";

export type {
  AnimationBone,
  AnimationClipData,
  AnimationTrack,
  AnimationKey,
  AnimationLibraryItem,
  VideoSource,
  BlenderInfo,
  EngineInfo,
  EngineParameter,
  EngineSelection,
  EngineTask,
  ExportResult,
  PackageResult,
  MotionProvider,
  UpdateState,
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
  ReferenceView,
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

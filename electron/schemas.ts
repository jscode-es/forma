import { z } from "zod";
import type { ProjectScene, ProjectSettings } from "./contract";

export const DEFAULT_SETTINGS: ProjectSettings = { quality: "balanced", physicalScale: false, heightMeters: 1.8 };
export const DEFAULT_SCENE: ProjectScene = { model: { type: "default-cube" } };

export const projectId = z.uuid();

export const projectName = z.string().trim().min(1).max(120);

export const projectSettings = z.object({
  quality: z.enum(["fast", "balanced", "high"]),
  physicalScale: z.boolean(),
  heightMeters: z.number().min(0.01).max(100),
});

const modelName = z.string().max(120);

export const sceneModel = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default-cube") }),
  z.object({ type: z.literal("asset"), assetId: z.uuid(), name: modelName }),
  z.object({ type: z.literal("staged"), stagingId: z.uuid(), name: modelName }),
]);

export const projectScene = z.object({ model: sceneModel });

export const projectInput = z.object({ name: projectName, settings: projectSettings, scene: projectScene });

export const modelSource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("staged"), stagingId: z.uuid() }),
  z.object({ type: z.literal("asset"), projectId: z.uuid(), assetId: z.uuid() }),
]);

function parseJson<T>(raw: string, schema: z.ZodType<T>, fallback: T, defaults: object = {}): T {
  try {
    const parsed = schema.safeParse({ ...defaults, ...JSON.parse(raw) });
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function parseStoredSettings(raw: string): ProjectSettings {
  return parseJson(raw, projectSettings, DEFAULT_SETTINGS, DEFAULT_SETTINGS);
}

export function parseStoredScene(raw: string): ProjectScene {
  const scene = parseJson(raw, projectScene, DEFAULT_SCENE);
  return scene.model.type === "staged" ? DEFAULT_SCENE : scene;
}

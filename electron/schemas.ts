import { z } from "zod";
import type { ProjectScene, ProjectSettings } from "./contract";

export const DEFAULT_SETTINGS: ProjectSettings = {
  quality: "balanced",
  physicalScale: false,
  heightMeters: 1.8,
  engine: { id: null, parameters: {} },
};
export const DEFAULT_SCENE: ProjectScene = { model: { type: "default-cube" }, references: [] };

export const projectId = z.uuid();

export const projectName = z.string().trim().min(1).max(120);

export const engineId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);

const parameterValue = z.union([z.number().finite(), z.boolean(), z.string().max(256)]);

export const parameterValues = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), parameterValue);

export const projectSettings = z.object({
  quality: z.enum(["fast", "balanced", "high"]),
  physicalScale: z.boolean(),
  heightMeters: z.number().min(0.01).max(100),
  engine: z.object({ id: engineId.nullable(), parameters: parameterValues }),
});

const modelName = z.string().max(120);

export const sceneModel = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default-cube") }),
  z.object({ type: z.literal("asset"), assetId: z.uuid(), name: modelName }),
  z.object({ type: z.literal("staged"), stagingId: z.uuid(), name: modelName }),
]);

export const imageSource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("staged"), stagingId: z.uuid() }),
  z.object({ type: z.literal("asset"), assetId: z.uuid() }),
]);

export const referenceImage = z.object({
  id: z.uuid(),
  name: z.string().max(120),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  original: imageSource,
  prepared: imageSource.nullable(),
  usePrepared: z.boolean(),
});

export const projectScene = z.object({ model: sceneModel, references: z.array(referenceImage).max(8).default([]) });

export const projectInput = z.object({ name: projectName, settings: projectSettings, scene: projectScene });

export const modelSource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("staged"), stagingId: z.uuid() }),
  z.object({ type: z.literal("asset"), projectId: z.uuid(), assetId: z.uuid() }),
]);

export const engineTask = z.enum(["image-to-3d", "text-to-3d", "remove-background", "texture", "rig", "animation"]);

export const jobRequest = z.object({
  engineId,
  task: engineTask,
  projectId: z.uuid().nullable(),
  parameters: parameterValues,
  images: z.array(imageSource).max(8),
});

const localizedText = z.object({ en: z.string().min(1).max(200), es: z.string().max(200).optional() });

const parameterId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);

export const engineManifest = z.object({
  id: engineId,
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(32),
  license: z.string().min(1).max(80),
  description: localizedText,
  tasks: z.array(engineTask).min(1),
  runtime: z.object({
    type: z.enum(["node", "python"]),
    entry: z.string().regex(/^[\w./-]+$/).refine((p) => !p.includes(".."), "entry must stay inside the engine folder"),
  }),
  timeoutSeconds: z.number().int().min(10).max(24 * 3600).default(1800),
  requirements: z
    .object({ vramGb: z.number().min(0).default(0), cuda: z.boolean().default(false) })
    .default({ vramGb: 0, cuda: false }),
  demo: z.boolean().default(false),
  inputs: z
    .object({ images: z.object({ min: z.number().int().min(0).max(8), max: z.number().int().min(0).max(8) }) })
    .default({ images: { min: 0, max: 0 } }),
  weights: z
    .array(
      z.object({
        id: engineId,
        name: z.string().min(1).max(120),
        optional: z.boolean().default(false),
        license: z.object({
          id: z.string().min(1).max(80),
          name: z.string().min(1).max(160),
          url: z.url({ protocol: /^https$/ }),
          summary: localizedText,
        }),
        source: z.object({
          type: z.enum(["huggingface", "github"]),
          repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
          revision: z.string().regex(/^[0-9a-f]{40}$/),
        }),
        files: z
          .array(
            z.object({
              path: z
                .string()
                .regex(/^[\w.-]+(\/[\w.-]+)*$/)
                .refine((p) => !p.split("/").includes(".."), "path must stay inside the weights folder"),
              size: z.number().int().positive(),
              sha256: z.string().regex(/^[0-9a-f]{64}$/),
            }),
          )
          .min(1),
      }),
    )
    .default([]),
  parameters: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          id: parameterId,
          type: z.enum(["integer", "number"]),
          label: localizedText,
          min: z.number(),
          max: z.number(),
          step: z.number().positive().optional(),
          default: z.number(),
        }),
        z.object({ id: parameterId, type: z.literal("boolean"), label: localizedText, default: z.boolean() }),
        z.object({
          id: parameterId,
          type: z.literal("enum"),
          label: localizedText,
          options: z.array(z.object({ value: z.string().min(1).max(64), label: localizedText })).min(1),
          default: z.string(),
        }),
      ]),
    )
    .default([]),
});

export type EngineManifest = z.infer<typeof engineManifest>;

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
  return {
    model: scene.model.type === "staged" ? DEFAULT_SCENE.model : scene.model,
    references: scene.references.filter((r) => r.original.type === "asset" && r.prepared?.type !== "staged"),
  };
}

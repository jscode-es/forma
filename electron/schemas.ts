import { z } from "zod";
import type { ProjectScene, ProjectSettings } from "./contract";

export const DEFAULT_SETTINGS: ProjectSettings = {
  quality: "balanced",
  qualitySteps: { fast: 15, balanced: 30, high: 50 },
  physicalScale: false,
  heightMeters: 1.8,
  engine: { id: null, parameters: {} },
  imageEngine: { id: null, parameters: {} },
  textureEngine: { id: null, parameters: {} },
  textureReferenceId: null,
};
export const DEFAULT_VARIANT_ID = "00000000-0000-4000-8000-000000000000";

export function defaultScene(): ProjectScene {
  return {
    references: [],
    prompts: [],
    variants: [
      {
        id: DEFAULT_VARIANT_ID,
        label: "Cube",
        origin: "default",
        parentId: null,
        engineId: null,
        model: { type: "default-cube" },
        lods: [],
        params: {},
        createdAt: new Date(0).toISOString(),
        sha256: null,
        triangles: 12,
      },
    ],
    activeVariantId: DEFAULT_VARIANT_ID,
  };
}

export const projectId = z.uuid();

export const projectName = z.string().trim().min(1).max(120);

export const engineId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);

const parameterValue = z.union([z.number().finite(), z.boolean(), z.string().max(256)]);

export const parameterValues = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), parameterValue);

export const projectSettings = z.object({
  quality: z.enum(["fast", "balanced", "high"]),
  qualitySteps: z.object({
    fast: z.number().int().min(1).max(200),
    balanced: z.number().int().min(1).max(200),
    high: z.number().int().min(1).max(200),
  }),
  physicalScale: z.boolean(),
  heightMeters: z.number().min(0.01).max(100),
  engine: z.object({ id: engineId.nullable(), parameters: parameterValues }),
  imageEngine: z.object({ id: engineId.nullable(), parameters: parameterValues }),
  textureEngine: z.object({ id: engineId.nullable(), parameters: parameterValues }).default({ id: null, parameters: {} }),
  textureReferenceId: z.uuid().nullable().default(null),
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

export const REFERENCE_VIEWS = ["front", "back", "left", "right", "top"] as const;

export const referenceView = z.enum(REFERENCE_VIEWS);

export const referenceImage = z.object({
  id: z.uuid(),
  view: referenceView.default("front"),
  name: z.string().max(120),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  original: imageSource,
  prepared: imageSource.nullable(),
  usePrepared: z.boolean(),
  prompt: z
    .object({ text: z.string().max(1000), seed: z.number().int().min(0).nullable(), engineId })
    .nullable()
    .default(null),
});

export const promptText = z.string().trim().min(1).max(1000);

export const promptEntry = z.object({
  id: z.uuid(),
  text: promptText,
  engineId,
  params: parameterValues,
  createdAt: z.string().max(40),
});

export const variant = z.object({
  id: z.uuid(),
  label: z.string().max(120),
  origin: z.enum(["default", "import", "generation", "optimize", "texture", "material", "retopology", "uv", "normals", "paint", "rig", "animation"]),
  parentId: z.uuid().nullable(),
  engineId: engineId.nullable(),
  model: sceneModel,
  lods: z.array(sceneModel).max(3),
  params: parameterValues,
  createdAt: z.string().max(40),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  triangles: z.number().int().min(0).nullable(),
});

export const projectScene = z
  .object({
    references: z.array(referenceImage).max(8),
    prompts: z.array(promptEntry).max(50).default([]),
    variants: z.array(variant).min(1).max(24),
    activeVariantId: z.uuid(),
  })
  .refine((s) => s.variants.some((v) => v.id === s.activeVariantId), "active variant missing");

const legacyScene = z.object({ model: sceneModel, references: z.array(referenceImage).max(8).default([]) });

export const projectInput = z.object({ name: projectName, settings: projectSettings, scene: projectScene });

export const modelSource = z.discriminatedUnion("type", [
  z.object({ type: z.literal("staged"), stagingId: z.uuid() }),
  z.object({ type: z.literal("asset"), projectId: z.uuid(), assetId: z.uuid() }),
]);

export const engineTask = z.enum(["image-to-3d", "text-to-3d", "text-to-image", "remove-background", "optimize", "texture", "rig", "animation", "mesh-inspect", "retopology", "uv-unwrap", "normals", "video-to-motion"]);

export const jobRequest = z.object({
  videos: z.array(z.object({ stagingId: z.uuid(), name: z.string().min(1).max(120) })).max(1).default([]),
  engineId,
  task: engineTask,
  projectId: z.uuid().nullable(),
  parameters: parameterValues,
  images: z.array(imageSource).max(8),
  models: z.array(sceneModel).max(4),
  prompt: promptText.nullable().default(null),
  views: z.array(referenceView).max(REFERENCE_VIEWS.length).default([]),
});

const localizedText = z.object({ en: z.string().min(1).max(600), es: z.string().max(600).optional() });

const parameterId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);

export const engineManifest = z.object({
  id: engineId,
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(32),
  license: z.string().min(1).max(80),
  description: localizedText,
  tasks: z.array(engineTask).min(1),
  runtime: z.object({
    type: z.enum(["node", "python", "blender"]),
    entry: z.string().regex(/^[\w./-]+$/).refine((p) => !p.includes(".."), "entry must stay inside the engine folder"),
  }),
  timeoutSeconds: z.number().int().min(10).max(24 * 3600).default(1800),
  requirements: z
    .object({ vramGb: z.number().min(0).default(0), cuda: z.boolean().default(false) })
    .default({ vramGb: 0, cuda: false }),
  demo: z.boolean().default(false),
  inputs: z
    .object({
      images: z.object({ min: z.number().int().min(0).max(8), max: z.number().int().min(0).max(8) }).default({ min: 0, max: 0 }),
      models: z.object({ min: z.number().int().min(0).max(4), max: z.number().int().min(0).max(4) }).default({ min: 0, max: 0 }),
      views: z.array(referenceView).max(REFERENCE_VIEWS.length).default([]),
      videos: z.object({ min: z.number().int().min(0).max(1), max: z.number().int().min(0).max(1) }).default({ min: 0, max: 0 }),
    })
    .default({ images: { min: 0, max: 0 }, models: { min: 0, max: 0 }, views: [], videos: { min: 0, max: 0 } }),
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
        source: z.union([z.object({
          type: z.enum(["huggingface", "github"]),
          repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
          revision: z.string().regex(/^[0-9a-f]{40}$/),
        }), z.object({ type: z.literal("mediapipe"), repo: z.literal("pose_landmarker/pose_landmarker_lite"), revision: z.literal("1") })]),
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
          tasks: z.array(engineTask).optional(),
          min: z.number(),
          max: z.number(),
          step: z.number().positive().optional(),
          default: z.number(),
        }),
        z.object({ id: parameterId, type: z.literal("boolean"), label: localizedText, tasks: z.array(engineTask).optional(), default: z.boolean() }),
        z.object({
          id: parameterId,
          type: z.literal("enum"),
          label: localizedText,
          tasks: z.array(engineTask).optional(),
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
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultScene();
  }
  const references = (refs: z.infer<typeof referenceImage>[]) =>
    refs.filter((r) => r.original.type === "asset" && r.prepared?.type !== "staged");

  const current = projectScene.safeParse(data);
  if (current.success) {
    const variants = current.data.variants.filter((v) => v.model.type !== "staged");
    const active = variants.some((v) => v.id === current.data.activeVariantId) ? current.data.activeVariantId : variants[0]?.id;
    if (!active) return defaultScene();
    return { references: references(current.data.references), prompts: current.data.prompts, variants, activeVariantId: active };
  }

  const legacy = legacyScene.safeParse(data);
  if (!legacy.success) return defaultScene();
  const scene = defaultScene();
  const model = legacy.data.model;
  if (model.type === "asset") {
    scene.variants[0] = { ...scene.variants[0], label: model.name, origin: "import", model, triangles: null };
  }
  scene.references = references(legacy.data.references);
  return scene;
}

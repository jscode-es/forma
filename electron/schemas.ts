import { z } from "zod";
import type { ProjectSettings } from "./contract";

export const DEFAULT_SETTINGS: ProjectSettings = { quality: "balanced", physicalScale: false, heightMeters: 1.8 };

export const projectId = z.uuid();

export const projectName = z.string().trim().min(1).max(120);

export const projectSettings = z.object({
  quality: z.enum(["fast", "balanced", "high"]),
  physicalScale: z.boolean(),
  heightMeters: z.number().min(0.01).max(100),
});

export const projectInput = z.object({ name: projectName, settings: projectSettings });

export function parseStoredSettings(raw: string): ProjectSettings {
  try {
    const parsed = projectSettings.safeParse({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

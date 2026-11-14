import { z } from "zod";
import type { AnimationClipData } from "./contract";

const component = z.number().finite().min(-10000).max(10000);
const triple = z.tuple([component, component, component]);
const quaternion = z.tuple([component, component, component, component]).refine((value) => Math.abs(Math.hypot(...value) - 1) < .001);
const boneName = z.string().min(1).max(120);

export const animationClip: z.ZodType<AnimationClipData> = z.object({
  version: z.literal(1), name: z.string().trim().min(1).max(120), fps: z.number().int().min(1).max(120), durationFrames: z.number().int().min(1).max(72000),
  bones: z.array(z.object({ name: boneName, parent: boneName.nullable(), translation: triple, rotation: quaternion, scale: triple.refine((value) => value.every((part) => part > 0)) })).min(1).max(256),
  tracks: z.array(z.object({ bone: boneName, path: z.enum(["translation", "rotation", "scale"]), interpolation: z.enum(["LINEAR", "STEP"]), keys: z.array(z.object({ frame: z.number().finite().min(0), value: z.array(component).min(3).max(4) })).min(1).max(10000) })).min(1).max(768),
}).superRefine((clip, context) => {
  const fail = () => context.addIssue({ code: "custom", message: "animation.invalidClip" });
  const bones = new Map(clip.bones.map((bone) => [bone.name, bone]));
  if (bones.size !== clip.bones.length || new TextEncoder().encode(JSON.stringify(clip)).byteLength > 4 * 1024 * 1024) fail();
  for (const bone of clip.bones) {
    const visited = new Set<string>([bone.name]);
    let parent = bone.parent;
    while (parent) {
      if (visited.has(parent) || !bones.has(parent)) { fail(); break; }
      visited.add(parent);
      parent = bones.get(parent)!.parent;
    }
  }
  const tracks = new Set<string>();
  for (const track of clip.tracks) {
    const key = `${track.bone}:${track.path}`;
    if (!bones.has(track.bone) || tracks.has(key)) fail();
    tracks.add(key);
    let previous = -1;
    for (const keyframe of track.keys) {
      if (keyframe.frame <= previous || keyframe.frame > clip.durationFrames || keyframe.value.length !== (track.path === "rotation" ? 4 : 3)) fail();
      if (track.path === "rotation" && Math.abs(Math.hypot(...keyframe.value) - 1) >= .001) fail();
      if (track.path === "scale" && keyframe.value.some((part) => part <= 0)) fail();
      previous = keyframe.frame;
    }
  }
});

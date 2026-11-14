import { Download, ImagePlus, Play, Sparkles, type LucideIcon } from "lucide-react";
import type en from "@/lib/i18n/locales/en.json";
import type { InspectorTab, SectionId } from "@/stores/workspace-store";

export type SectionKey = keyof typeof en.inspector.sections;

export const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "createReference", icon: ImagePlus },
  { id: "create3d", icon: Sparkles },
  { id: "createAnimation", icon: Play },
  { id: "export", icon: Download },
];

export const SECTION_TABS: Record<SectionId, InspectorTab[]> = {
  createReference: ["text", "views"],
  create3d: ["create", "model", "finish", "edit"],
  createAnimation: ["capture", "rig", "clips", "retarget"],
  export: ["files", "interchange"],
};

export type PlannedSection = { id: SectionKey; phase: number };

export const PLANNED_SECTIONS: Record<InspectorTab, PlannedSection[]> = {
  text: [],
  views: [
    { id: "multiView", phase: 10 },
    { id: "referenceReview", phase: 10 },
  ],
  create: [{ id: "retopology", phase: 12 }],
  model: [
    { id: "retopology", phase: 12 },
    { id: "inspect", phase: 12 },
  ],
  finish: [
    { id: "texture", phase: 11 },
    { id: "materials", phase: 11 },
    { id: "paint", phase: 13 },
    { id: "uv", phase: 12 },
    { id: "normals", phase: 12 },
  ],
  edit: [
    { id: "proportions", phase: 10 },
    { id: "projection", phase: 10 },
  ],
  capture: [
    { id: "video", phase: 15 },
    { id: "textMotion", phase: 15 },
  ],
  rig: [
    { id: "rig", phase: 14 },
    { id: "weights", phase: 14 },
  ],
  clips: [
    { id: "presets", phase: 15 },
    { id: "clips", phase: 15 },
    { id: "timeline", phase: 15 },
  ],
  retarget: [{ id: "retarget", phase: 15 }],
  files: [],
  interchange: [{ id: "interchange", phase: 17 }],
};

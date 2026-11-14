import { Download, Play, Sparkles, type LucideIcon } from "lucide-react";
import type en from "@/lib/i18n/locales/en.json";
import type { InspectorTab, SectionId } from "@/stores/workspace-store";

export type SectionKey = keyof typeof en.inspector.sections;

export const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "create3d", icon: Sparkles },
  { id: "createAnimation", icon: Play },
  { id: "export", icon: Download },
];

export const INSPECTOR_TABS: InspectorTab[] = ["create", "model", "finish", "edit", "animation", "export"];

export type PlannedSection = { id: SectionKey; phase: number };

export const PLANNED_SECTIONS: Record<InspectorTab, PlannedSection[]> = {
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
  animation: [
    { id: "rig", phase: 14 },
    { id: "clips", phase: 15 },
    { id: "video", phase: 15 },
  ],
  export: [
    { id: "interchange", phase: 17 },
  ],
};

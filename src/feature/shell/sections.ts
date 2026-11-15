import { Download, Play, Sparkles, type LucideIcon } from "lucide-react";
import type en from "@/lib/i18n/locales/en.json";
import type { InspectorTab, SectionId } from "@/stores/workspace-store";

export type SectionKey = keyof typeof en.inspector.sections;

export const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "create3d", icon: Sparkles },
  { id: "createAnimation", icon: Play },
  { id: "export", icon: Download },
];

export const SECTION_TABS: Record<SectionId, InspectorTab[]> = {
  create3d: ["create", "model", "finish", "edit"],
  createAnimation: ["capture", "rig", "clips", "retarget"],
  export: ["files", "interchange"],
};

export type PlannedSection = { id: SectionKey; phase: number };

export const PLANNED_SECTIONS: Record<InspectorTab, PlannedSection[]> = {
  create: [],
  model: [],
  finish: [],
  edit: [],
  capture: [
  ],
  rig: [],
  clips: [],
  retarget: [],
  files: [],
  interchange: [],
};

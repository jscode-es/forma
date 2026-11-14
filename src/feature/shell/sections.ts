import { Box, Clapperboard, type LucideIcon } from "lucide-react";
import type { SectionId } from "@/stores/workspace-store";

export const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "create3d", icon: Box },
  { id: "createAnimation", icon: Clapperboard },
];

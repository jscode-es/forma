import { create } from "zustand";
import { enqueueRigTask } from "@/feature/jobs";
import { displayedVariant, useProjectStore } from "@/stores/project-store";

export type RigBone = { index: number; name: string; parent: number | null; position: [number, number, number] };
type Triple = [number, number, number];
type RigState = {
  sessionId: string | null;
  variantId: string | null;
  guides: Record<string, Triple>;
  bones: RigBone[];
  clips: string[];
  hasSkin: boolean;
  selectedBone: number;
  pose: Triple;
  offset: Triple;
  showGuides: boolean;
  showBones: boolean;
  showWeights: boolean;
  clipPolicy: "preserve" | "discard";
  revision: number;
};

const DEFAULT_GUIDES: Record<string, Triple> = {
  hips: [0, .52, 0], spine: [0, .66, 0], chest: [0, .78, 0], neck: [0, .88, 0], head: [0, .98, 0],
  leftHip: [.10, .50, 0], rightHip: [-.10, .50, 0],
  leftShoulder: [.18, .78, 0], rightShoulder: [-.18, .78, 0],
  leftElbow: [.34, .78, 0], rightElbow: [-.34, .78, 0],
  leftWrist: [.47, .78, 0], rightWrist: [-.47, .78, 0],
  leftKnee: [.10, .27, 0], rightKnee: [-.10, .27, 0],
  leftAnkle: [.10, .05, 0], rightAnkle: [-.10, .05, 0],
  leftToe: [.10, .03, .35], rightToe: [-.10, .03, .35],
};

function defaultGuides() {
  return Object.fromEntries(Object.entries(DEFAULT_GUIDES).map(([name, value]) => [name, [...value] as Triple]));
}

export const useRigStore = create<RigState>()(() => ({ sessionId: null, variantId: null, guides: defaultGuides(), bones: [], clips: [], hasSkin: false, selectedBone: 0, pose: [0, 0, 0], offset: [0, 0, 0], showGuides: false, showBones: false, showWeights: false, clipPolicy: "preserve", revision: 0 }));

export function recordRigModel(info: Pick<RigState, "sessionId" | "variantId" | "bones" | "clips" | "hasSkin">) {
  useRigStore.setState((state) => {
    const changed = info.sessionId !== state.sessionId || info.variantId !== state.variantId;
    return { ...info, ...(changed ? { guides: defaultGuides(), selectedBone: info.bones[0]?.index ?? 0, pose: [0, 0, 0] as Triple, offset: [0, 0, 0] as Triple, showWeights: false, showGuides: false } : {}), revision: state.revision + 1 };
  });
}

export function setRigOptions(patch: Partial<RigState>) {
  useRigStore.setState((state) => ({ ...patch, revision: state.revision + 1 }));
}

export function updateRigGuide(name: string, axis: 0 | 1 | 2, value: number) {
  const current = useRigStore.getState().guides[name];
  if (!current || !Number.isFinite(value) || value < (axis === 1 ? -.1 : -.75) || value > (axis === 1 ? 1.1 : .75)) return;
  const guide: Triple = [...current];
  guide[axis] = value;
  useRigStore.setState((state) => ({ guides: { ...state.guides, [name]: guide }, revision: state.revision + 1 }));
}

export function resetRigGuides() {
  setRigOptions({ guides: defaultGuides() });
}

export function resetRigPose() {
  setRigOptions({ pose: [0, 0, 0] });
}

export function autoRig() {
  const state = useRigStore.getState();
  const project = useProjectStore.getState();
  if (state.sessionId !== project.sessionId || state.variantId !== displayedVariant(project).id) return Promise.resolve();
  const guides = Object.fromEntries(Object.entries(state.guides).flatMap(([name, value]) => value.map((coordinate, index) => [`${name}${["X", "Y", "Z"][index]}`, coordinate])));
  return enqueueRigTask({ mode: "auto", clipPolicy: state.clipPolicy, ...guides });
}

export function editRig() {
  const { selectedBone, offset, clipPolicy, sessionId, variantId, bones } = useRigStore.getState();
  const project = useProjectStore.getState();
  if (sessionId !== project.sessionId || variantId !== displayedVariant(project).id || !bones.some((bone) => bone.index === selectedBone)) return Promise.resolve();
  return enqueueRigTask({ mode: "edit", clipPolicy, boneIndex: selectedBone, offsetX: offset[0], offsetY: offset[1], offsetZ: offset[2] });
}

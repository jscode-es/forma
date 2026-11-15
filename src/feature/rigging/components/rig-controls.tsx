"use client";

import { useId, useState } from "react";
import { Button, Input, Label, Select, Switch } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { ACTIVE, useJobsStore } from "@/feature/jobs";
import { useViewerStore } from "@/feature/viewport/viewer-store";
import { displayedVariant, useProjectStore, variantName } from "@/stores/project-store";
import { autoRig, editRig, resetRigGuides, resetRigPose, setRigOptions, updateRigGuide, useRigStore } from "../store";
import styles from "../rigging.module.css";

const GUIDES = ["hips", "spine", "chest", "neck", "head", "leftHip", "rightHip", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle", "leftToe", "rightToe"] as const;
const AXES = [0, 1, 2] as const;
const SELECT_PROPS = {
  isSearchable: false,
  menuPosition: "fixed" as const,
  menuPlacement: "auto" as const,
  styles: { menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 60 }) },
};

function useRigContext() {
  const source = useProjectStore(displayedVariant);
  const sessionId = useProjectStore((state) => state.sessionId);
  const rig = useRigStore();
  const loaded = useViewerStore((state) => state.status === "ready");
  const busy = useJobsStore((state) => state.jobs.some((job) => job.task === "rig" && ACTIVE.has(job.status)));
  const available = useJobsStore((state) => state.engines.some((engine) => engine.id === "forma-blender-rig" && engine.available));
  const sameSource = loaded && rig.sessionId === sessionId && rig.variantId === source.id;
  return { source, rig, busy, available, sameSource, ready: sameSource && source.model.type !== "default-cube" && available && !busy };
}

function VectorFields({ label, values, min, max, step, disabled, onChange }: {
  label: string;
  values: [number, number, number];
  min: number | [number, number, number];
  max: number | [number, number, number];
  step: number;
  disabled: boolean;
  onChange: (axis: 0 | 1 | 2, value: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return <fieldset className={styles.vector} disabled={disabled}>
    <legend className={styles.legend}>{label}</legend>
    <div className={styles.axes}>{AXES.map((axis) => {
      const lower = typeof min === "number" ? min : min[axis];
      const upper = typeof max === "number" ? max : max[axis];
      return <div key={axis} className={styles.stack}>
        <Label htmlFor={`${id}-${axis}`}>{t(`rigging.axes.${axis}`)}</Label>
        <Input id={`${id}-${axis}`} type="number" min={lower} max={upper} step={step} value={values[axis]}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value) && value >= lower && value <= upper) onChange(axis, value);
          }} />
      </div>;
    })}</div>
  </fieldset>;
}

function RigClips() {
  const { t } = useTranslation();
  const { rig, sameSource, busy } = useRigContext();
  const id = useId();
  const policies = (["preserve", "discard"] as const).map((value) => ({ value, label: t(`rigging.policy.${value}`) }));
  return <div className={styles.stack}>
    <Label htmlFor={id}>{t("rigging.clipPolicy")}</Label>
    <Select {...SELECT_PROPS} inputId={id} options={policies} value={policies.find((option) => option.value === rig.clipPolicy)} isDisabled={busy}
      menuPortalTarget={typeof document === "undefined" ? null : document.body}
      onChange={(option) => { if (option) setRigOptions({ clipPolicy: option.value }); }} />
    {sameSource && <>
      <span className={styles.hint}>{t("rigging.clips", { count: rig.clips.length })}</span>
      {rig.clips.length > 0 && <ul className={styles.clips}>{rig.clips.map((clip, index) => <li key={`${index}-${clip}`}>{clip || t("rigging.unnamedClip", { index: index + 1 })}</li>)}</ul>}
    </>}
  </div>;
}

export function RigControl() {
  const { t } = useTranslation();
  const { source, rig, sameSource, busy, available, ready } = useRigContext();
  const id = useId();
  const [guide, setGuide] = useState<string>(GUIDES[0]);
  const error = useJobsStore((state) => state.enqueueError);
  const guides = GUIDES.map((value) => ({ value, label: t(`rigging.guides.${value}`) }));
  const replacingRig = sameSource && (rig.bones.length > 0 || rig.hasSkin);

  return <div className={styles.stack} aria-busy={busy}>
    <span className={styles.hint}>{t("rigging.source", { name: variantName(source, t("scene.cube")) })}</span>
    {!available && <span className={styles.hint}>{t("rigging.blenderMissing")}</span>}
    {source.model.type === "default-cube" && <span className={styles.hint}>{t("rigging.needsModel")}</span>}
    <Label htmlFor={`${id}-guide`}>{t("rigging.guide")}</Label>
    <Select {...SELECT_PROPS} inputId={`${id}-guide`} options={guides} value={guides.find((option) => option.value === guide)} isDisabled={!ready}
      menuPortalTarget={typeof document === "undefined" ? null : document.body}
      onChange={(option) => { if (option) setGuide(option.value); }} />
    <VectorFields label={t("rigging.guidePosition")} values={rig.guides[guide] ?? [0, 0, 0]} min={[-0.75, -0.1, -0.75]} max={[0.75, 1.1, 0.75]} step={0.01} disabled={!ready}
      onChange={(axis, value) => updateRigGuide(guide, axis, value)} />
    <div className={styles.toggle}><Label htmlFor={`${id}-guides`}>{t("rigging.showGuides")}</Label><Switch id={`${id}-guides`} checked={rig.showGuides} disabled={!ready} onCheckedChange={(showGuides) => setRigOptions({ showGuides })} /></div>
    <Button variant="outline" disabled={!ready} onClick={resetRigGuides}>{t("rigging.resetGuides")}</Button>
    <RigClips />
    {replacingRig && <span className={styles.hint}>{t("rigging.replaceHint")}</span>}
    <Button disabled={!ready || (replacingRig && rig.clipPolicy !== "discard")} onClick={() => void autoRig()}>{t(busy ? "rigging.running" : "rigging.preview")}</Button>
    {error && <span className={styles.error} role="alert">{t("rigging.failed")}</span>}
  </div>;
}

function BoneSelect({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const { rig, sameSource } = useRigContext();
  const options = sameSource ? rig.bones.map((bone) => ({ value: String(bone.index), label: bone.name || t("rigging.unnamedBone", { index: bone.index + 1 }) })) : [];
  return <div className={styles.stack}>
    <Label htmlFor={id}>{t("rigging.bone")}</Label>
    <Select {...SELECT_PROPS} inputId={id} options={options} value={options.find((option) => option.value === String(rig.selectedBone)) ?? null} isDisabled={disabled}
      placeholder={t("rigging.chooseBone")} noOptionsMessage={() => t("rigging.noBones")}
      menuPortalTarget={typeof document === "undefined" ? null : document.body}
      onChange={(option) => { if (option) setRigOptions({ selectedBone: Number(option.value), pose: [0, 0, 0], offset: [0, 0, 0] }); }} />
  </div>;
}

export function RigEditorControl() {
  const { t } = useTranslation();
  const id = useId();
  const { rig, sameSource, busy, ready } = useRigContext();
  const error = useJobsStore((state) => state.enqueueError);
  const selected = sameSource && rig.bones.some((bone) => bone.index === rig.selectedBone);
  const disabled = !ready || !selected;
  function updateVector(key: "pose" | "offset", axis: 0 | 1 | 2, value: number) {
    const vector: [number, number, number] = [...rig[key]];
    vector[axis] = value;
    setRigOptions({ [key]: vector });
  }
  return <div className={styles.stack} aria-busy={busy}>
    <BoneSelect disabled={!ready || !sameSource || !rig.bones.length} />
    {(!sameSource || !rig.bones.length) && <span className={styles.hint}>{t("rigging.noBones")}</span>}
    <div className={styles.toggle}><Label htmlFor={`${id}-bones`}>{t("rigging.showBones")}</Label><Switch id={`${id}-bones`} checked={rig.showBones} disabled={disabled} onCheckedChange={(showBones) => setRigOptions({ showBones })} /></div>
    <VectorFields label={t("rigging.offset")} values={rig.offset} min={-0.5} max={0.5} step={0.01} disabled={disabled} onChange={(axis, value) => updateVector("offset", axis, value)} />
    <RigClips />
    <Button disabled={disabled} onClick={() => void editRig()}>{t(busy ? "rigging.running" : "rigging.previewEdit")}</Button>
    <VectorFields label={t("rigging.pose")} values={rig.pose} min={-90} max={90} step={1} disabled={disabled} onChange={(axis, value) => updateVector("pose", axis, value)} />
    <Button variant="outline" disabled={disabled} onClick={resetRigPose}>{t("rigging.resetPose")}</Button>
    {error && <span className={styles.error} role="alert">{t("rigging.failed")}</span>}
  </div>;
}

export function RigWeightsControl() {
  const { t } = useTranslation();
  const id = useId();
  const { rig, sameSource, ready } = useRigContext();
  const disabled = !ready || !sameSource || !rig.hasSkin || !rig.bones.some((bone) => bone.index === rig.selectedBone);
  return <div className={styles.stack}>
    <BoneSelect disabled={!ready || !sameSource || !rig.hasSkin || !rig.bones.length} />
    <div className={styles.toggle}><Label htmlFor={id}>{t("rigging.showWeights")}</Label><Switch id={id} checked={rig.showWeights} disabled={disabled} onCheckedChange={(showWeights) => setRigOptions({ showWeights })} /></div>
    {(!sameSource || !rig.hasSkin) && <span className={styles.hint}>{t("rigging.noSkin")}</span>}
  </div>;
}

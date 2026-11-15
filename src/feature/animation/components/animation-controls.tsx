"use client";

import { useEffect, useId, useState } from "react";
import { Button, Checkbox, Input, Label, Select, Slider, Switch, Textarea, ToggleGroup, ToggleGroupItem } from "@kivora/nextjs";
import { NumberField } from "@/components/number-field";
import { useTranslation } from "react-i18next";
import type { AnimationClipData, AnimationTrack, MotionProvider } from "@/lib/forma";
import { useJobsStore } from "@/feature/jobs";
import { useModelsStore } from "@/feature/models";
import { displayedVariant, useProjectStore } from "@/stores/project-store";
import { chooseAnimationVideo, createPreset, generateTextMotion, deleteAnimationKey, deleteLibraryAnimation, discardAnimation, exportLibraryAnimation, generateVideoMotion, getAnimationValues, importLibraryAnimation, loadAnimationSource, loadLibraryAnimation, redoAnimation, refreshAnimationLibrary, resumeAnimationSource, retargetLibraryAnimation, saveAnimationToLibrary, saveAnimationVariant, selectSourceClip, setAnimationKey, setAnimationMapping, setAnimationName, setAnimationPlayback, setAnimationTiming, undoAnimation, useAnimationStore } from "../store";
import styles from "../animation.module.css";

type Option = { value: string; label: string };
const AXES = [0, 1, 2] as const;
const PATHS = ["translation", "rotation", "scale"] as const;
const attempt = (operation: Promise<unknown>) => { void operation.catch(() => undefined); };

function Choice({ label, options, value, disabled, onChange }: { label: string; options: Option[]; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const id = useId();
  const { t } = useTranslation();
  return <div className={styles.stack}>
    <Label htmlFor={id}>{label}</Label>
    <Select inputId={id} options={options} value={options.find((option) => option.value === value) ?? null} isSearchable={false} isDisabled={disabled}
      placeholder={t("animation.choose")} noOptionsMessage={() => t("animation.empty")}
      menuPortalTarget={typeof document === "undefined" ? null : document.body} menuPosition="fixed" menuPlacement="auto" styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      onChange={(option) => { if (option) onChange(option.value); }} />
  </div>;
}

function useContext() {
  const animation = useAnimationStore();
  const displayed = useProjectStore(displayedVariant);
  const sessionId = useProjectStore((state) => state.sessionId);
  const comparing = useProjectStore((state) => state.comparing);
  const sameSource = animation.sessionId === sessionId && animation.variantId === displayed.id;
  return { animation, sameSource, disabled: animation.busy || animation.blocked || comparing, editingDisabled: animation.busy || animation.blocked || comparing || !sameSource };
}

function AnimationError() {
  const { t } = useTranslation();
  const error = useAnimationStore((state) => state.error);
  return error ? <span className={styles.error} role="alert">{t(error, { defaultValue: t("animation.failed") })}</span> : null;
}

function LibraryChoice({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const library = useAnimationStore((state) => state.library);
  useEffect(() => { attempt(refreshAnimationLibrary()); }, []);
  return <Choice label={t("animation.libraryClip")} options={library.map((item) => ({ value: item.id, label: item.name }))} value={value} disabled={disabled} onChange={onChange} />;
}

export function AnimationLibraryControl() {
  const { t } = useTranslation();
  const { animation, disabled, editingDisabled } = useContext();
  const [selection, setSelection] = useState("");
  const selected = animation.library.some((item) => item.id === selection) ? selection : "";
  const clips = animation.source?.clips ?? [];
  return <div className={styles.stack} aria-busy={animation.busy}>
    <AnimationError />
    <Button variant="outline" disabled={disabled || animation.dirty} onClick={() => attempt(loadAnimationSource())}>{t("animation.loadSource")}</Button>
    {animation.source && <span className={styles.hint}>{t("animation.source", { name: animation.source.label })}</span>}
    <Choice label={t("animation.sourceClip")} options={clips.map((clip, index) => ({ value: String(index), label: clip.name }))} value={String(clips.findIndex((clip) => clip.name === animation.draft?.name))} disabled={editingDisabled || animation.dirty || !clips.length} onChange={(value) => selectSourceClip(Number(value))} />
    <div className={styles.actions}>{(["idle", "walk", "run"] as const).map((kind) => <Button key={kind} size="sm" variant="outline" disabled={disabled || animation.dirty} onClick={() => attempt(createPreset(kind))}>{t(`animation.presets.${kind}`)}</Button>)}</div>
    <LibraryChoice value={selected} disabled={disabled} onChange={setSelection} />
    <div className={styles.actions}>
      <Button disabled={disabled || !selected || animation.dirty} onClick={() => attempt(loadLibraryAnimation(selected))}>{t("animation.loadLibrary")}</Button>
      <Button variant="outline" disabled={disabled || !animation.draft} onClick={() => attempt(saveAnimationToLibrary())}>{t("animation.saveLibrary")}</Button>
      <Button variant="outline" disabled={disabled} onClick={() => attempt(importLibraryAnimation())}>{t("animation.importLibrary")}</Button>
      <Button variant="outline" disabled={disabled || !selected} onClick={() => attempt(exportLibraryAnimation(selected))}>{t("animation.exportLibrary")}</Button>
      <Button variant="outline" disabled={disabled || !selected} onClick={() => attempt(deleteLibraryAnimation(selected))}>{t("animation.deleteLibrary")}</Button>
    </div>
  </div>;
}

export function AnimationEditorControl() {
  const { t } = useTranslation();
  const id = useId();
  const { animation, sameSource, disabled, editingDisabled } = useContext();
  const { draft, frame, revision } = animation;
  const [selectedBone, setSelectedBone] = useState("");
  const [path, setPath] = useState<AnimationTrack["path"]>("rotation");
  const [interpolationEdit, setInterpolationEdit] = useState<{ key: string; value: "LINEAR" | "STEP" } | null>(null);
  const [edit, setEdit] = useState<{ key: string; values: [number, number, number] } | null>(null);
  const bone = draft?.bones.find((item) => item.name === selectedBone)?.name ?? draft?.bones[0]?.name ?? "";
  const key = `${bone}:${path}:${frame}:${revision}`;
  const values = edit?.key === key ? edit.values : draft && bone ? getAnimationValues(bone, path, frame) : [0, 0, 0];
  const track = draft?.tracks.find((item) => item.bone === bone && item.path === path);
  const interpolation = interpolationEdit?.key === key ? interpolationEdit.value : track?.interpolation ?? "LINEAR";
  const selectedKey = track?.keys.some((item) => Math.abs(item.frame - frame) < 1e-6);
  const locked = editingDisabled || !draft;
  return <div className={styles.stack} aria-busy={animation.busy}>
    <AnimationError />
    <Button variant="outline" disabled={disabled || animation.dirty} onClick={() => attempt(loadAnimationSource())}>{t("animation.loadSource")}</Button>
    {!draft && <span className={styles.hint}>{t("animation.editorHint")}</span>}
    {draft && <>
      {animation.dirty && <span className={styles.hint} role="status">{t("animation.unsaved")}</span>}
      {!sameSource && <div className={styles.stack}><span className={styles.hint}>{t("animation.differentSource")}</span><Button variant="outline" disabled={disabled} onClick={resumeAnimationSource}>{t("animation.resumeSource")}</Button></div>}
      <Label htmlFor={`${id}-name`}>{t("animation.name")}</Label>
      <Input id={`${id}-name`} value={draft.name} maxLength={120} disabled={locked} onChange={(event) => setAnimationName(event.target.value)} />
      <div className={styles.pair}>
        <div className={styles.stack}><Label htmlFor={`${id}-fps`}>{t("animation.fps")}</Label><NumberField id={`${id}-fps`} min={1} max={120} step={1} value={draft.fps} disabled={locked} onValueChange={(value) => setAnimationTiming(value, draft.durationFrames)} /></div>
        <div className={styles.stack}><Label htmlFor={`${id}-duration`}>{t("animation.duration")}</Label><NumberField id={`${id}-duration`} integer min={1} max={36000} step={1} value={draft.durationFrames} disabled={locked} onValueChange={(value) => setAnimationTiming(draft.fps, value)} /></div>
      </div>
      <Choice label={t("animation.bone")} options={draft.bones.map((item) => ({ value: item.name, label: item.name }))} value={bone} disabled={locked} onChange={setSelectedBone} />
      <Choice label={t("animation.channel")} options={PATHS.map((value) => ({ value, label: t(`animation.paths.${value}`) }))} value={path} disabled={locked} onChange={(value) => setPath(value as AnimationTrack["path"])} />
      <Label htmlFor={`${id}-frame`}>{t("animation.frame")}</Label>
      <Input id={`${id}-frame`} type="number" min={0} max={draft.durationFrames} step={1} value={Math.round(frame * 1000) / 1000} disabled={locked} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= draft.durationFrames) setAnimationPlayback({ frame: value, playing: false }); }} />
      <fieldset className={styles.vector} disabled={locked}><legend>{t(`animation.values.${path}`)}</legend><div className={styles.axes}>{AXES.map((axis) => <div className={styles.stack} key={axis}>
        <Label htmlFor={`${id}-axis-${axis}`}>{t(`animation.axes.${axis}`)}</Label>
        <Input id={`${id}-axis-${axis}`} type="number" step={path === "rotation" ? 1 : .01} min={path === "scale" ? .001 : undefined} value={Math.round(values[axis] * 10000) / 10000} onChange={(event) => { const value = event.target.valueAsNumber; if (!Number.isFinite(value) || (path === "scale" && value <= 0)) return; const next: [number, number, number] = [values[0], values[1], values[2]]; next[axis] = value; setEdit({ key, values: next }); }} />
      </div>)}</div></fieldset>
      <Choice label={t("animation.interpolation")} options={[{ value: "LINEAR", label: t("animation.linear") }, { value: "STEP", label: t("animation.step") }]} value={interpolation} disabled={locked} onChange={(value) => setInterpolationEdit({ key, value: value as "LINEAR" | "STEP" })} />
      <div className={styles.actions}>
        <Button disabled={locked || !bone} onClick={() => setAnimationKey(bone, path, frame, [values[0], values[1], values[2]], interpolation)}>{t(selectedKey ? "animation.updateKey" : "animation.addKey")}</Button>
        <Button variant="outline" disabled={locked || !selectedKey} onClick={() => deleteAnimationKey(bone, path, frame)}>{t("animation.deleteKey")}</Button>
      </div>
      <span className={styles.hint}>{t("animation.keyCount", { count: track?.keys.length ?? 0 })}</span>
      {!!track?.keys.length && <div className={styles.keys} role="group" aria-label={t("animation.keys")}>{track.keys.map((item) => <Button key={item.frame} size="sm" variant="outline" disabled={locked} aria-pressed={Math.abs(item.frame - frame) < 1e-6} onClick={() => { setAnimationPlayback({ frame: item.frame, playing: false }); }}>{t("animation.keyFrame", { frame: Math.round(item.frame * 1000) / 1000 })}</Button>)}</div>}
      <div className={styles.actions}>
        <Button variant="outline" disabled={locked || !animation.canUndo} onClick={undoAnimation}>{t("animation.undo")}</Button>
        <Button variant="outline" disabled={locked || !animation.canRedo} onClick={redoAnimation}>{t("animation.redo")}</Button>
        <Button disabled={locked || !animation.dirty} onClick={() => attempt(saveAnimationVariant())}>{t("animation.saveVariant")}</Button>
        <Button variant="outline" disabled={disabled} onClick={discardAnimation}>{t("animation.discard")}</Button>
      </div>
    </>}
  </div>;
}

export function AnimationRetargetControl() {
  const { t } = useTranslation();
  const { animation, disabled } = useContext();
  const [selection, setSelection] = useState("");
  const [loaded, setLoaded] = useState<{ id: string; clip: AnimationClipData } | null>(null);
  const [failed, setFailed] = useState(false);
  const clip = loaded?.id === selection ? loaded.clip : null;
  const targets = animation.source?.bones ?? [];
  useEffect(() => {
    if (!selection || !window.forma) return;
    let cancelled = false;
    window.forma.animations.read(selection).then((data) => { if (!cancelled) { setLoaded({ id: selection, clip: data }); setFailed(false); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [selection]);
  return <div className={styles.stack} aria-busy={animation.busy}>
    <AnimationError />
    <Button variant="outline" disabled={disabled || animation.dirty} onClick={() => attempt(loadAnimationSource())}>{t("animation.loadSource")}</Button>
    <LibraryChoice value={selection} disabled={disabled} onChange={setSelection} />
    {failed && <span className={styles.error} role="alert">{t("animation.failed")}</span>}
    <Button variant="outline" disabled={disabled || !clip || !targets.length} onClick={() => clip?.bones.forEach((bone) => { if (targets.some((target) => target.name === bone.name)) setAnimationMapping(bone.name, bone.name); })}>{t("animation.matchNames")}</Button>
    {clip?.bones.map((bone) => <Choice key={bone.name} label={t("animation.mapBone", { name: bone.name })} options={targets.map((target) => ({ value: target.name, label: target.name }))} value={animation.mapping[bone.name] ?? ""} disabled={disabled} onChange={(value) => setAnimationMapping(bone.name, value)} />)}
    <Button disabled={disabled || animation.dirty || !clip || !targets.length || clip.bones.some((bone) => !animation.mapping[bone.name])} onClick={() => attempt(retargetLibraryAnimation(selection, animation.mapping))}>{t("animation.retarget")}</Button>
  </div>;
}

export function AnimationVideoControl() {
  const { t } = useTranslation();
  const { animation, disabled } = useContext();
  const available = useJobsStore((state) => state.engines.some((engine) => engine.tasks.includes("video-to-motion") && engine.available));
  return <div className={styles.stack} aria-busy={animation.busy}>
    <AnimationError />
    <Button variant="outline" disabled={disabled} onClick={() => attempt(chooseAnimationVideo())}>{t("animation.chooseVideo")}</Button>
    {animation.video && <span className={styles.hint}>{animation.video.name}</span>}
    {!available && <><span className={styles.hint}>{t("animation.videoUnavailable")}</span><Button variant="outline" onClick={() => useModelsStore.getState().setOpen(true)}>{t("animation.openModels")}</Button></>}
    <Button disabled={disabled || animation.dirty || !available || !animation.video} onClick={() => attempt(generateVideoMotion())}>{t("animation.generateVideo")}</Button>
  </div>;
}

export function AnimationTextControl() {
  const { t } = useTranslation();
  const id = useId();
  const { animation, disabled } = useContext();
  const engine = useJobsStore((state) => state.engines.some((entry) => entry.tasks.includes("text-to-motion") && entry.available));
  const running = useJobsStore((state) => state.jobs.some((job) => job.task === "text-to-motion" && (job.status === "queued" || job.status === "running")));
  const [providers, setProviders] = useState<MotionProvider[] | null>(null);
  const [provider, setProvider] = useState<MotionProvider["id"]>("codex");
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(3);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    let active = true;
    void window.forma?.system.motionProviders().then((list) => {
      if (!active) return;
      setProviders(list);
      const first = list.find((entry) => entry.available);
      if (first) setProvider(first.id);
    });
    return () => {
      active = false;
    };
  }, []);

  const selected = providers?.find((entry) => entry.id === provider);
  const ready = engine && Boolean(selected?.available) && prompt.trim().length > 0 && consent && !running;
  return <div className={styles.stack} aria-busy={running}>
    <AnimationError />
    <ToggleGroup type="single" value={provider} onValueChange={(value) => { if (value) { setProvider(value as MotionProvider["id"]); setConsent(false); } }} aria-label={t("animation.textProvider")}>
      {(["codex", "claude", "copilot"] as const).map((value) => <ToggleGroupItem key={value} value={value} size="sm">{t(`animation.textProviders.${value}`)}</ToggleGroupItem>)}
    </ToggleGroup>
    <span className={styles.hint}>{providers === null ? t("animation.textChecking") : selected?.available ? t("animation.textReady", { version: selected.version }) : t("animation.textMissing")}</span>
    <Textarea aria-label={t("animation.textPrompt")} value={prompt} maxLength={2000} minRows={3} autoResize placeholder={t("animation.textPlaceholder")} onChange={(event) => setPrompt(event.target.value)} />
    <div className={styles.toggle}>
      <Label htmlFor={`${id}-seconds`}>{t("animation.textSeconds")}</Label>
      <NumberField id={`${id}-seconds`} integer min={1} max={10} step={1} value={seconds} style={{ width: "5rem" }} onValueChange={setSeconds} />
    </div>
    <div className={styles.toggle}>
      <Checkbox id={`${id}-consent`} checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
      <Label htmlFor={`${id}-consent`}>{t("animation.textConsent")}</Label>
    </div>
    <span className={styles.hint}>{t("animation.textPrivacy")}</span>
    <Button disabled={disabled || animation.dirty || !ready} onClick={() => { setConsent(false); attempt(generateTextMotion(provider, seconds, prompt.trim())); }}>{running ? t("animation.textRunning") : t("animation.textGenerate")}</Button>
  </div>;
}

export function AnimationTimeline() {
  const { t } = useTranslation();
  const id = useId();
  const { animation, editingDisabled } = useContext();
  const { draft, frame, playing, loop, speed } = animation;
  const disabled = editingDisabled || !draft;
  return <div className={styles.timeline}>
    <Button size="sm" variant="outline" disabled={disabled} onClick={() => setAnimationPlayback({ playing: !playing })}>{t(playing ? "animation.pause" : "animation.play")}</Button>
    <div className={styles.scrub}><Label htmlFor={`${id}-scrub`}>{t("animation.timelineFrame", { frame: Math.round(frame), duration: draft?.durationFrames ?? 0 })}</Label><Slider id={`${id}-scrub`} aria-label={t("animation.scrub")} min={0} max={draft?.durationFrames ?? 1} step={1} value={[frame]} disabled={disabled} onValueChange={([value]) => setAnimationPlayback({ frame: value, playing: false })} /></div>
    <div className={styles.toggle}><Label htmlFor={`${id}-loop`}>{t("animation.loop")}</Label><Switch id={`${id}-loop`} checked={loop} disabled={disabled} onCheckedChange={(value) => setAnimationPlayback({ loop: value })} /></div>
    <div className={styles.speed}><Choice label={t("animation.speed")} options={[.25, .5, 1, 1.5, 2].map((value) => ({ value: String(value), label: t("animation.speedValue", { value }) }))} value={String(speed)} disabled={disabled} onChange={(value) => setAnimationPlayback({ speed: Number(value) })} /></div>
  </div>;
}

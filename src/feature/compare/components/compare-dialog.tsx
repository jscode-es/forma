"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Label,
} from "@kivora/nextjs";
import { Columns3, Download, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localized, useJobsStore } from "@/feature/jobs";
import { disposeObject } from "@/feature/viewport/engine/viewer";
import { computeStats, createDefaultCube, parseGlb } from "@/feature/viewport/engine/models";
import type { ModelSource, Variant } from "@/lib/forma";
import { useProjectStore, variantName } from "@/stores/project-store";
import { CAPTURE_VIEWS, renderComparison, type CaptureEntry } from "../capture";
import styles from "../compare.module.css";

const MAX_SELECTED = 6;
const SHOWN_PARAMS = ["steps", "guidanceScale", "octreeResolution", "seed", "atlasResolution", "budget", "samples"];

function sourceOf(variant: Variant, projectId: string | null): ModelSource | null {
  const model = variant.model;
  if (model.type === "staged") return { type: "staged", stagingId: model.stagingId };
  if (model.type === "asset" && projectId) return { type: "asset", projectId, assetId: model.assetId };
  return null;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
}

export function CompareButton() {
  const { t } = useTranslation();
  const count = useProjectStore((s) => s.variants.length);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" disabled={count < 2} onClick={() => setOpen(true)}>
        <Icon icon={Columns3} size={14} />
        {t("compare.open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <CompareContent />}
      </Dialog>
    </>
  );
}

function CompareContent() {
  const { t, i18n } = useTranslation();
  const variants = useProjectStore((s) => s.variants);
  const projectId = useProjectStore((s) => s.id);
  const projectName = useProjectStore((s) => s.name);
  const engines = useJobsStore((s) => s.engines);
  const ordered = useMemo(() => [...variants].reverse(), [variants]);
  const [selected, setSelected] = useState<string[]>(() => ordered.filter((v) => v.origin !== "default").slice(0, 4).map((v) => v.id));
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const number = new Intl.NumberFormat(i18n.language);
  const decimal = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const megabytes = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id].slice(0, MAX_SELECTED) : current.filter((value) => value !== id)));
  }

  async function render() {
    setBusy(true);
    setMessage(null);
    const loaded: CaptureEntry[] = [];
    try {
      for (const variant of ordered.filter((v) => selected.includes(v.id)).reverse()) {
        const source = sourceOf(variant, projectId);
        const bytes = source ? await window.forma!.models.read(source) : null;
        const object = bytes ? await parseGlb(bytes) : createDefaultCube(t("scene.cube"));
        const stats = computeStats(object);
        const engine = engines.find((e) => e.id === variant.engineId);
        const params = SHOWN_PARAMS.filter((key) => variant.params[key] !== undefined).map((key) => `${key} ${variant.params[key]}`);
        loaded.push({
          object,
          title: variantName(variant, t("scene.cube")),
          lines: [
            engine ? engine.name : t(`versions.origin.${variant.origin}`),
            t("compare.triangles", { value: number.format(stats.triangles), vertices: number.format(stats.vertices) }),
            t("compare.size", { x: decimal.format(stats.size.x), y: decimal.format(stats.size.y), z: decimal.format(stats.size.z) }),
            t("compare.materials", { materials: stats.materials, textures: stats.textures }),
            ...(bytes ? [t("compare.file", { value: megabytes.format(bytes.byteLength / 1048576) })] : []),
            ...[0, 2, 4].filter((start) => start < params.length).map((start) => params.slice(start, start + 2).join(" · ")),
            ...(engine ? [localized({ en: engine.license }, i18n.language)] : []),
          ],
        });
      }
      const views = CAPTURE_VIEWS.map((view) => ({ ...view, label: t(`compare.views.${view.id}`) }));
      const blob = await renderComparison(loaded, views, {
        title: t("compare.sheetTitle", { name: projectName ?? t("topBar.untitled") }),
        subtitle: t("compare.sheetSubtitle", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date()) }),
      });
      setImage({ url: URL.createObjectURL(blob), blob });
    } catch (error) {
      setMessage({ error: true, text: errorText(error) });
    } finally {
      for (const entry of loaded) disposeObject(entry.object);
      setBusy(false);
    }
  }

  async function save() {
    if (!image) return;
    try {
      const result = await window.forma!.captures.save(new Uint8Array(await image.blob.arrayBuffer()), t("compare.fileName", { name: projectName ?? t("topBar.untitled") }));
      if (result) setMessage({ error: false, text: t("compare.saved", { path: result.path }) });
    } catch (error) {
      setMessage({ error: true, text: errorText(error) });
    }
  }

  return (
    <DialogContent style={{ maxWidth: "64rem" }}>
      <DialogHeader>
        <DialogTitle>{t("compare.title")}</DialogTitle>
        <DialogDescription>{t("compare.description")}</DialogDescription>
      </DialogHeader>
      <div className={styles.layout}>
        <fieldset className={styles.choices}>
          <legend className={styles.legend}>{t("compare.choose", { max: MAX_SELECTED })}</legend>
          {ordered.map((variant) => {
            const checked = selected.includes(variant.id);
            const id = `compare-${variant.id}`;
            return (
              <div key={variant.id} className={styles.choice}>
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={busy || (!checked && selected.length >= MAX_SELECTED)}
                  onCheckedChange={(value) => toggle(variant.id, value === true)}
                />
                <Label htmlFor={id}>
                  {variantName(variant, t("scene.cube"))}
                  <span className={styles.origin}>{t(`versions.origin.${variant.origin}`)}</span>
                </Label>
              </div>
            );
          })}
        </fieldset>
        <div className={styles.preview} aria-busy={busy}>
          {image ? (
            <img src={image.url} alt={t("compare.imageAlt", { count: selected.length })} />
          ) : (
            <div className={styles.empty}>
              <Icon icon={ImageIcon} size={22} />
              <span>{busy ? t("compare.rendering") : t("compare.empty")}</span>
            </div>
          )}
        </div>
      </div>
      {message && (
        <p className={message.error ? styles.error : styles.hint} role={message.error ? "alert" : "status"}>
          {message.error ? t(`errors.${message.text}`, { defaultValue: message.text }) : message.text}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" disabled={!image || busy} onClick={() => void save()}>
          <Icon icon={Download} size={15} />
          {t("compare.save")}
        </Button>
        <Button disabled={busy || selected.length < 2} onClick={() => void render()}>
          <Icon icon={Columns3} size={15} />
          {busy ? t("compare.rendering") : t("compare.render")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

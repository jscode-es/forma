"use client";

import { Badge, Button, Icon, Switch, Label } from "@kivora/nextjs";
import { Eraser, ImagePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, backgroundEngine, removeBackground, useJobsStore } from "@/feature/jobs";
import { useBlobUrl } from "@/hooks/use-blob-url";
import type { ImageSource, ReferenceImage } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import styles from "../references.module.css";

function sourceKey(source: ImageSource) {
  return source.type === "staged" ? `s:${source.stagingId}` : `a:${source.assetId}`;
}

function Thumbnail({ source, label }: { source: ImageSource; label: string }) {
  const projectId = useProjectStore((s) => s.id);
  const url = useBlobUrl(`${sourceKey(source)}:${projectId}`, () => window.forma?.references.read(source, projectId));
  return (
    <figure className={styles.thumb}>
      {url ? <img src={url} alt={label} /> : <span className={styles.placeholder} />}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

async function importReference() {
  try {
    const reference = await window.forma?.references.import();
    if (reference) useProjectStore.getState().setReference(reference);
  } catch (error) {
    useJobsStore.setState({ enqueueError: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error) });
  }
}

function ReferenceCard({ reference }: { reference: ReferenceImage }) {
  const { t } = useTranslation();
  const update = useProjectStore((s) => s.updateReference);
  const remove = useProjectStore((s) => s.removeReference);
  const engines = useJobsStore((s) => s.engines);
  const busy = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "remove-background"));
  const engine = engines.length > 0 ? backgroundEngine() : undefined;

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <strong className={styles.name}>{reference.name}</strong>
        <Badge variant="outline">
          {reference.width}×{reference.height}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("references.remove")}
          title={t("references.remove")}
          onClick={() => remove(reference.id)}
        >
          <Icon icon={Trash2} size={14} />
        </Button>
      </div>
      {reference.prompt && (
        <span className={styles.hint}>
          {reference.prompt.seed === null ? t("prompt.fromPrompt") : t("prompt.fromPromptSeed", { seed: reference.prompt.seed })}
        </span>
      )}
      <div className={styles.thumbs}>
        <Thumbnail source={reference.original} label={t("references.original")} />
        {reference.prepared && <Thumbnail source={reference.prepared} label={t("references.prepared")} />}
      </div>
      {reference.prepared ? (
        <div className={styles.row}>
          <Label htmlFor={`use-prepared-${reference.id}`}>{t("references.usePrepared")}</Label>
          <Switch
            id={`use-prepared-${reference.id}`}
            checked={reference.usePrepared}
            onCheckedChange={(usePrepared) => update(reference.id, { usePrepared })}
          />
        </div>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={!engine || busy}
        title={engine ? engine.name : t("references.noBackgroundEngine")}
        onClick={() => removeBackground(reference.id)}
      >
        <Icon icon={Eraser} size={14} />
        {busy ? t("references.removing") : reference.prepared ? t("references.removeAgain") : t("references.removeBackground")}
      </Button>
      {!engine && <span className={styles.hint}>{t("references.noBackgroundEngine")}</span>}
    </div>
  );
}

export function ReferencePanel() {
  const { t } = useTranslation();
  const references = useProjectStore((s) => s.references);

  if (references.length === 0) {
    return (
      <button type="button" className={styles.dropzone} onClick={importReference} disabled={!window.forma}>
        <span className={styles.iconTile}>
          <Icon icon={ImagePlus} size={20} />
        </span>
        <strong>{t("references.dropTitle")}</strong>
        <span className={styles.hint}>{t("references.dropHint")}</span>
      </button>
    );
  }

  return (
    <div className={styles.list}>
      {references.map((reference) => (
        <ReferenceCard key={reference.id} reference={reference} />
      ))}
      <Button size="sm" variant="ghost" onClick={importReference}>
        <Icon icon={ImagePlus} size={14} />
        {t("references.replace")}
      </Button>
    </div>
  );
}

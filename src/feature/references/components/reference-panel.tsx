"use client";

import { useRef, useState, type DragEvent } from "react";
import { Button, ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { ACTIVE, backgroundEngine, errorMessage, removeBackground, useJobsStore } from "@/feature/jobs";
import { useBlobUrl } from "@/hooks/use-blob-url";
import type { ReferenceView } from "@/lib/forma";
import { activeImage, REFERENCE_VIEWS, useProjectStore } from "@/stores/project-store";
import styles from "../references.module.css";

const FACES: Record<ReferenceView, string> = {
  front: "4,8 14,8 14,18 4,18",
  back: "8,4 18,4 18,14 8,14",
  left: "4,8 8,4 8,14 4,18",
  right: "14,8 18,4 18,14 14,18",
  top: "4,8 8,4 18,4 14,8",
};

function ViewIcon({ view, large = false }: { view: ReferenceView; large?: boolean }) {
  return <svg width={large ? 36 : 18} height={large ? 36 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
    <polygon points={FACES[view]} fill="currentColor" fillOpacity="0.25" />
    <path d="M4 8h10v10H4z M8 4h10v10 M4 8l4-4 M14 8l4-4 M14 18l4-4" />
    <path d="M8 4v10H4 M8 14l6 4" strokeDasharray="2 2" opacity="0.35" />
    <polygon points={FACES[view]} />
  </svg>;
}

export function ReferenceSlot({ view }: { view: ReferenceView }) {
  const { t } = useTranslation();
  const references = useProjectStore((s) => s.references);
  const reference = references.find((r) => r.view === view);
  const projectId = useProjectStore((s) => s.id);
  const sessionId = useProjectStore((s) => s.sessionId);
  const source = reference ? activeImage(reference) : null;
  const sourceKey = source ? `${sessionId}:${projectId}:${JSON.stringify(source)}` : null;
  const url = useBlobUrl(sourceKey, () => source ? window.forma?.references.read(source, projectId) : undefined);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const depth = useRef(0);
  const engines = useJobsStore((s) => s.engines);
  const removing = useJobsStore((s) => s.jobs.some((j) => ACTIVE.has(j.status) && j.task === "remove-background"));
  const engine = engines.length > 0 ? backgroundEngine() : undefined;
  const label = t(`viewport.presets.${view}`);
  const api = typeof window === "undefined" ? undefined : window.forma;

  async function importImage(file?: File) {
    if (!api || importing) return;
    const session = useProjectStore.getState().sessionId;
    setError(null);
    setImporting(true);
    try {
      if (file && file.size > 20 * 1024 * 1024) throw new Error("image-too-large");
      const imported = file
        ? await api.references.importBytes(new Uint8Array(await file.arrayBuffer()), file.name.slice(0, 120))
        : await api.references.import();
      if (imported && useProjectStore.getState().sessionId === session) {
        useProjectStore.getState().setReference({ ...imported, view });
        useJobsStore.setState({ enqueueError: null });
      }
    } catch (error) {
      if (useProjectStore.getState().sessionId === session) {
        const message = errorMessage(error);
        setError(message);
        useJobsStore.setState({ enqueueError: message });
      }
    }
    finally { setImporting(false); }
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    depth.current = 0;
    setDragging(false);
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      setError("reference-drop-one");
      useJobsStore.setState({ enqueueError: "reference-drop-one" });
      return;
    }
    void importImage(files[0]);
  }

  function assign(next: ReferenceView) {
    if (!reference || next === view) return;
    const current = useProjectStore.getState().references;
    const other = current.find((r) => r.view === next);
    useProjectStore.getState().setReferences(current.map((r) => r.id === reference.id ? { ...r, view: next } : r.id === other?.id ? { ...r, view } : r));
  }

  return <div className={styles.slotGroup} role="group" aria-label={label}>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Button variant="outline" className={`${styles.slot} ${dragging ? styles.dragging : ""}`}
          disabled={!api || importing} aria-busy={importing}
          aria-label={t(reference ? "references.replaceView" : "references.add", { view: label })}
          title={t("references.slotHint")} onClick={() => void importImage()}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault(); depth.current++; setDragging(true);
          }}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
          onDragLeave={(event) => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); }}
          onDrop={drop}>
          <span className={styles.slotMedia}>
            {reference && url ? <>
              <img src={url} alt={reference.name} draggable={false} />
              <span className={styles.slotCaption}><ViewIcon view={view} /><span>{label}</span></span>
            </> : <span className={styles.slotPlaceholder}><ViewIcon view={view} large /><span>{importing ? t("references.importing") : label}</span></span>}
          </span>
        </Button>
      </ContextMenuTrigger>
      {reference && <ContextMenuContent>
        <ContextMenuItem onSelect={() => void importImage()}>{t("references.replace")}</ContextMenuItem>
        <ContextMenuItem disabled={!engine || removing} onSelect={() => void removeBackground(reference.id)}>{t(removing ? "references.removing" : "references.removeBackground")}</ContextMenuItem>
        {reference.prepared && <ContextMenuCheckboxItem checked={reference.usePrepared} onCheckedChange={(usePrepared) => useProjectStore.getState().updateReference(reference.id, { usePrepared })}>{t("references.usePrepared")}</ContextMenuCheckboxItem>}
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t("references.assign")}</ContextMenuSubTrigger>
          <ContextMenuSubContent>{REFERENCE_VIEWS.map((next) => <ContextMenuItem key={next} disabled={next === view} onSelect={() => assign(next)}>{t(`viewport.presets.${next}`)}</ContextMenuItem>)}</ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => useProjectStore.getState().removeReference(reference.id)}>{t("references.removeView", { view: label })}</ContextMenuItem>
      </ContextMenuContent>}
    </ContextMenu>
    {error && <span className={styles.error} role="alert">{t(`errors.${error}`, { defaultValue: error })}</span>}
  </div>;
}

export function ReferencePanel() {
  const { t } = useTranslation();
  const reference = useProjectStore((s) => s.references.find((r) => r.view === "front"));
  return <div className={styles.list}>
    <ReferenceSlot view="front" />
    {reference?.prompt && <span className={styles.hint}>{reference.prompt.seed === null ? t("prompt.fromPrompt") : t("prompt.fromPromptSeed", { seed: reference.prompt.seed })}</span>}
    <span className={styles.hint}>{t("references.dropHint")}</span>
  </div>;
}

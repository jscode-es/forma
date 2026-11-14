"use client";

import { useEffect, useState } from "react";
import { Button } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { errorMessage, useJobsStore } from "@/feature/jobs";
import { useProjectStore } from "@/stores/project-store";
import type { ReferenceImage } from "@/lib/forma";
import { reviewImage, matchReferenceHeight, type Review } from "../image-review";
import styles from "../references.module.css";

export function ReferenceReview() {
  const { t } = useTranslation();
  const references = useProjectStore((s) => s.references);
  const projectId = useProjectStore((s) => s.id);
  const [snapshot, setSnapshot] = useState<{ references: ReferenceImage[]; projectId: string | null; values: Record<string, Review> } | null>(null);
  const reviews = snapshot?.references === references && snapshot.projectId === projectId ? snapshot.values : {};
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all(references.map(async (r) => [r.id, await reviewImage(r, projectId)] as const))
      .then((entries) => { if (!cancelled) setSnapshot({ references, projectId, values: Object.fromEntries(entries) }); })
      .catch((error) => { if (!cancelled) useJobsStore.setState({ enqueueError: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [references, projectId]);
  const ready = references.filter((r) => r.view !== "top");
  const canMatch = ready.length > 1 && ready.every((r) => reviews[r.id]?.bounds && !reviews[r.id].opaque);
  const heights = ready.map((r) => reviews[r.id]).filter((r) => r?.bounds && !r.opaque).map((r) => r.bounds!.height / r.height);
  const scaleWarning = heights.length > 1 && Math.max(...heights) / Math.min(...heights) > 1.15;
  const front = references.find((r) => r.view === "front");
  const back = references.find((r) => r.view === "back");
  const left = references.find((r) => r.view === "left");
  const right = references.find((r) => r.view === "right");
  const different = (a: typeof front, b: typeof back) => {
    const x = a && reviews[a.id], y = b && reviews[b.id];
    if (!x?.bounds || !y?.bounds || x.opaque || y.opaque) return false;
    const ratio = (x.bounds.width / x.bounds.height) / (y.bounds.width / y.bounds.height);
    return ratio < 0.8 || ratio > 1.25;
  };
  async function match() {
    const state = useProjectStore.getState();
    setBusy(true);
    try {
      const heightFraction = Math.min(0.8, ...ready.map((r) => {
        const bounds = reviews[r.id].bounds!;
        return 0.9 * bounds.height / bounds.width;
      }));
      const prepared = await Promise.all(ready.map(async (r) => ({ id: r.id, source: await matchReferenceHeight(r, projectId, reviews[r.id].bounds!, heightFraction) })));
      const current = useProjectStore.getState();
      if (current.sessionId !== state.sessionId || current.references !== state.references) return;
      current.setReferences(current.references.map((r) => {
        const result = prepared.find((p) => p.id === r.id);
        return result ? { ...r, prepared: result.source, usePrepared: true } : r;
      }));
    } catch (error) { useJobsStore.setState({ enqueueError: errorMessage(error) }); }
    finally { setBusy(false); }
  }
  return <div className={styles.list}>
    <span className={styles.hint}>{t("references.reviewHint")}</span>
    {references.map((r) => <span key={r.id} className={styles.hint}>
      {t(`viewport.presets.${r.view}`)}: {reviews[r.id] ? t(!reviews[r.id].bounds ? "references.empty" : reviews[r.id].opaque ? "references.opaque" : "references.silhouetteReady") : t("references.reviewing")}
    </span>)}
    {scaleWarning && <span role="status">{t("references.scaleWarning")}</span>}
    {(different(front, back) || different(left, right)) && <span role="status">{t("references.silhouetteWarning")}</span>}
    <Button size="sm" variant="outline" disabled={!canMatch || busy} onClick={match}>{t(busy ? "references.matching" : "references.matchHeight")}</Button>
  </div>;
}

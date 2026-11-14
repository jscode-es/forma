"use client";

import { useState } from "react";
import {
  Badge,
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
  Progress,
} from "@kivora/nextjs";
import { Download, ExternalLink, RefreshCw, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localized, useJobsStore } from "@/feature/jobs";
import type { WeightsState } from "@/lib/forma";
import { checkUpdates, formatBytes, useModelsStore } from "../models-store";
import styles from "../models.module.css";

const STATUS_VARIANT: Record<WeightsState["status"], "default" | "secondary" | "destructive" | "outline"> = {
  missing: "outline",
  partial: "outline",
  downloading: "default",
  verifying: "default",
  installed: "secondary",
  corrupt: "destructive",
};

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    useJobsStore.setState({ enqueueError: error instanceof Error ? error.message : String(error) });
  }
}

export function ModelManagerDialog() {
  const open = useModelsStore((s) => s.open);
  const setOpen = useModelsStore((s) => s.setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <ManagerContent />}
    </Dialog>
  );
}

function ManagerContent() {
  const { t, i18n } = useTranslation();
  const weights = useModelsStore((s) => s.weights);
  const checking = useModelsStore((s) => s.checking);
  const diskFree = useJobsStore((s) => s.hardware?.diskFreeBytes ?? null);
  const [licenseFor, setLicenseFor] = useState<WeightsState | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const installed = weights.filter((w) => w.status === "installed").reduce((sum, w) => sum + w.sizeBytes, 0);
  const engines = [...new Set(weights.map((w) => w.engineName))];

  function download(entry: WeightsState) {
    if (entry.licenseAccepted) run(() => window.forma!.weights.download(entry.id));
    else setLicenseFor(entry);
  }

  return (
    <DialogContent style={{ maxWidth: "48rem" }}>
      <DialogHeader>
        <DialogTitle>{t("models.title")}</DialogTitle>
        <DialogDescription>{t("models.description")}</DialogDescription>
      </DialogHeader>

      <div className={styles.summary}>
        <span>{t("models.installed", { size: formatBytes(installed, i18n.language) })}</span>
        {diskFree !== null && <span>{t("models.free", { size: formatBytes(diskFree, i18n.language) })}</span>}
        <span className={styles.spacer} />
        <Button size="sm" variant="outline" disabled={checking} onClick={() => checkUpdates()}>
          <Icon icon={RefreshCw} size={14} />
          {checking ? t("models.checking") : t("models.checkUpdates")}
        </Button>
      </div>

      {weights.length === 0 && <p className={styles.hint}>{t("models.empty")}</p>}

      <div className={styles.groups}>
        {engines.map((engineName) => (
          <section key={engineName} className={styles.group}>
            <h4 className={styles.groupTitle}>{engineName}</h4>
            {weights
              .filter((w) => w.engineName === engineName)
              .map((w) => {
                const busy = w.status === "downloading" || w.status === "verifying";
                const update = w.latestRevision && w.latestRevision !== w.source.revision;
                return (
                  <div key={w.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitle}>
                        <strong>{w.name}</strong>
                        <Badge variant={STATUS_VARIANT[w.status]}>{t(`models.status.${w.status}`)}</Badge>
                        {w.optional && <Badge variant="outline">{t("models.optional")}</Badge>}
                        {update && <Badge variant="outline">{t("models.updateAvailable")}</Badge>}
                      </div>
                      <span className={styles.hint}>
                        {formatBytes(w.sizeBytes, i18n.language)} · {w.license.id} · {w.source.repo}@{w.source.revision.slice(0, 7)}
                        {w.vramGb > 0 ? ` · ${t("models.vram", { value: w.vramGb })}` : ""}
                      </span>
                      {update && <span className={styles.hint}>{t("models.updateHint", { revision: w.latestRevision!.slice(0, 7) })}</span>}
                      {w.status === "downloading" && (
                        <Progress value={Math.round((w.downloadedBytes / w.sizeBytes) * 100)} size="sm" />
                      )}
                      {w.error && w.error !== "corrupt" && <span className={styles.error}>{w.error}</span>}
                    </div>
                    <div className={styles.actions}>
                      {w.status === "downloading" && (
                        <Button size="sm" variant="ghost" onClick={() => run(() => window.forma!.weights.cancel(w.id))}>
                          <Icon icon={Square} size={14} />
                          {t("models.pause")}
                        </Button>
                      )}
                      {!busy && w.status !== "installed" && (
                        <Button size="sm" onClick={() => download(w)}>
                          <Icon icon={Download} size={14} />
                          {t(w.status === "partial" ? "models.resume" : w.status === "corrupt" ? "models.repair" : "models.download")}
                        </Button>
                      )}
                      {w.status === "installed" && removing !== w.id && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => run(() => window.forma!.weights.verify(w.id))}>
                            <Icon icon={ShieldCheck} size={14} />
                            {t("models.verify")}
                          </Button>
                          <Button size="icon" variant="ghost" aria-label={t("models.remove")} title={t("models.remove")} onClick={() => setRemoving(w.id)}>
                            <Icon icon={Trash2} size={14} />
                          </Button>
                        </>
                      )}
                      {removing === w.id && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                            {t("common.cancel")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setRemoving(null);
                              run(() => window.forma!.weights.remove(w.id));
                            }}
                          >
                            {t("models.confirmRemove")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
          </section>
        ))}
      </div>

      <Dialog open={licenseFor !== null} onOpenChange={(value) => !value && setLicenseFor(null)}>
        {licenseFor && (
          <LicenseContent
            entry={licenseFor}
            language={i18n.language}
            onCancel={() => setLicenseFor(null)}
            onAccept={() => {
              const entry = licenseFor;
              setLicenseFor(null);
              run(async () => {
                await window.forma!.weights.acceptLicense(entry.id);
                await window.forma!.weights.download(entry.id);
              });
            }}
          />
        )}
      </Dialog>
    </DialogContent>
  );
}

function LicenseContent({
  entry,
  language,
  onAccept,
  onCancel,
}: {
  entry: WeightsState;
  language: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("models.license.title", { name: entry.name })}</DialogTitle>
        <DialogDescription>{t("models.license.description")}</DialogDescription>
      </DialogHeader>
      <div className={styles.license}>
        <strong>{entry.license.name}</strong>
        <span>{localized(entry.license.summary, language)}</span>
        <a href={entry.license.url} target="_blank" rel="noreferrer" className={styles.link}>
          {t("models.license.read")}
          <Icon icon={ExternalLink} size={13} />
        </a>
        <span className={styles.hint}>{t("models.license.responsibility")}</span>
      </div>
      <div className={styles.checkRow}>
        <Checkbox id="accept-license" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
        <Label htmlFor="accept-license">{t("models.license.accept")}</Label>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button disabled={!accepted} onClick={onAccept}>
          {t("models.license.acceptAndDownload")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

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
} from "@kivora/nextjs";
import { ExternalLink, FolderOpen, Power, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage, localized, useJobsStore } from "@/feature/jobs";
import type { PluginState } from "@/lib/forma";
import { useModelsStore } from "../models-store";
import styles from "../models.module.css";

export function PluginsSection() {
  const { t, i18n } = useTranslation();
  const plugins = useModelsStore((s) => s.plugins);
  const [activating, setActivating] = useState<PluginState | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (plugins.length === 0) return null;

  return (
    <section className={styles.group}>
      {plugins.map((p) => (
        <div key={p.id} className={styles.item}>
          <div className={styles.itemMain}>
            <div className={styles.itemTitle}>
              <strong>{p.name}</strong>
              <Badge variant={p.status === "installed" ? "secondary" : p.status === "failed" ? "destructive" : "outline"}>
                {t(`plugins.status.${p.status}`)}
              </Badge>
              <Badge variant="outline">v{p.version}</Badge>
            </div>
            <span className={styles.hint}>{localized(p.description, i18n.language)}</span>
            {p.status === "installing" && (
              <>
                <span className={styles.hint}>{t(`plugins.stage.${p.stage}`, { defaultValue: p.stage ?? "" })}</span>
                {p.log.length > 0 && <pre className={styles.log}>{p.log.join("\n")}</pre>}
              </>
            )}
            {p.error && <span className={styles.error}>{t(`plugins.error.${p.error}`, { defaultValue: p.error })}</span>}
          </div>
          <div className={styles.actions}>
            {p.status === "installing" && (
              <Button size="sm" variant="ghost" onClick={() => window.forma?.plugins.cancel(p.id)}>
                <Icon icon={Square} size={14} />
                {t("plugins.cancel")}
              </Button>
            )}
            {(p.status === "available" || p.status === "failed" || p.status === "outdated") && (
              <Button size="sm" onClick={() => setActivating(p)}>
                <Icon icon={Power} size={14} />
                {t(p.status === "outdated" ? "plugins.update" : "plugins.activate")}
              </Button>
            )}
            {p.status === "installed" && removing !== p.id && (
              <Button size="icon" variant="ghost" aria-label={t("plugins.uninstall")} title={t("plugins.uninstall")} onClick={() => setRemoving(p.id)}>
                <Icon icon={Trash2} size={14} />
              </Button>
            )}
            {removing === p.id && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setRemoving(null);
                    window.forma?.plugins.uninstall(p.id).catch((e) => setError(errorMessage(e)));
                  }}
                >
                  {t("plugins.confirmUninstall")}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
      {error && <span className={styles.error}>{error}</span>}

      <Dialog open={activating !== null} onOpenChange={(open) => !open && setActivating(null)}>
        {activating && (
          <ActivateContent
            plugin={activating}
            onClose={() => setActivating(null)}
            onError={(message) => setError(message)}
          />
        )}
      </Dialog>
    </section>
  );
}

function ActivateContent({ plugin, onClose, onError }: { plugin: PluginState; onClose: () => void; onError: (message: string) => void }) {
  const { t, i18n } = useTranslation();
  const hardware = useJobsStore((s) => s.hardware);
  const [accepted, setAccepted] = useState(false);
  const [useExisting, setUseExisting] = useState(false);
  const [python, setPython] = useState<string | null>(null);
  const vramGb = hardware?.vramMb ? hardware.vramMb / 1024 : null;
  const warnings = [
    plugin.requirements.cuda && !hardware?.cuda ? t("plugins.warn.cuda") : null,
    vramGb !== null && vramGb < plugin.requirements.vramGb ? t("plugins.warn.vram", { required: plugin.requirements.vramGb }) : null,
  ].filter(Boolean);

  return (
    <DialogContent style={{ maxWidth: "40rem" }}>
      <DialogHeader>
        <DialogTitle>{t("plugins.activateTitle", { name: plugin.name })}</DialogTitle>
        <DialogDescription>{localized(plugin.description, i18n.language)}</DialogDescription>
      </DialogHeader>

      <div className={styles.license}>
        <strong>{t("plugins.requirements")}</strong>
        <span>{t("plugins.reqGpu", { vram: plugin.requirements.vramGb })}</span>
        <span>{t("plugins.reqTools", { python: plugin.requirements.python })}</span>
        <span>{t("plugins.reqDisk", { size: plugin.requirements.diskGb })}</span>
        {warnings.map((w) => (
          <span key={w} className={styles.error}>
            {w}
          </span>
        ))}
      </div>

      <div className={styles.license}>
        <strong>{t("plugins.licenses")}</strong>
        {plugin.licenseNotice && <span>{localized(plugin.licenseNotice, i18n.language)}</span>}
        {plugin.weights.map((w) => (
          <span key={w.id}>
            {w.name}: {localized(w.license.summary, i18n.language)}{" "}
            <a href={w.license.url} target="_blank" rel="noreferrer" className={styles.link}>
              {w.license.name}
              <Icon icon={ExternalLink} size={12} />
            </a>
          </span>
        ))}
        <span className={styles.hint}>{t("models.license.responsibility")}</span>
      </div>

      <div className={styles.license}>
        <div className={styles.checkRow}>
          <Checkbox id="use-existing-python" checked={useExisting} onCheckedChange={(v) => setUseExisting(v === true)} />
          <Label htmlFor="use-existing-python">{t("plugins.existingPython")}</Label>
        </div>
        {useExisting && (
          <>
            <span className={styles.hint}>{t("plugins.existingPythonHint")}</span>
            <Button
              size="sm"
              variant="outline"
              style={{ justifySelf: "start" }}
              onClick={async () => setPython((await window.forma?.plugins.choosePython()) ?? python)}
            >
              <Icon icon={FolderOpen} size={14} />
              {python ?? t("plugins.choosePython")}
            </Button>
          </>
        )}
      </div>

      <div className={styles.checkRow}>
        <Checkbox id="accept-plugin" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
        <Label htmlFor="accept-plugin">{t("plugins.accept")}</Label>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!accepted || (useExisting && !python)}
          onClick={() => {
            onClose();
            window.forma?.plugins.install(plugin.id, useExisting ? python : null).catch((e) => onError(errorMessage(e)));
          }}
        >
          {t("plugins.acceptAndActivate")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Progress } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { localized, useJobsStore } from "@/feature/jobs";
import { useModelsStore } from "@/feature/models";
import type { BlenderInfo, MotionProvider } from "@/lib/forma";
import { useSettingsStore } from "@/stores/settings-store";
import { estimateDiskGb, recommend } from "../recommend";
import { installSelected, useOnboardingStore } from "../store";
import styles from "../onboarding.module.css";

type Extras = { python: string | null; blender: BlenderInfo | null; providers: MotionProvider[]; platform: string };

export function OnboardingDialog() {
  const open = useOnboardingStore((s) => s.open);
  const done = useSettingsStore((s) => s.onboardingDone);
  const hydrated = useSettingsStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && !done && window.forma) useOnboardingStore.getState().setOpen(true);
  }, [hydrated, done]);

  const close = () => {
    useOnboardingStore.getState().setOpen(false);
    useSettingsStore.getState().setOnboardingDone(true);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      {open && <OnboardingContent onClose={close} />}
    </Dialog>
  );
}

function OnboardingContent({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const step = useOnboardingStore((s) => s.step);
  const setStep = useOnboardingStore((s) => s.setStep);
  const queue = useOnboardingStore((s) => s.queue);
  const current = useOnboardingStore((s) => s.current);
  const failed = useOnboardingStore((s) => s.failed);
  const hardware = useJobsStore((s) => s.hardware);
  const engines = useJobsStore((s) => s.engines);
  const plugins = useModelsStore((s) => s.plugins);
  const weights = useModelsStore((s) => s.weights);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [accepted, setAccepted] = useState(false);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });

  useEffect(() => {
    const api = window.forma;
    if (!api) return;
    let active = true;
    void Promise.all([api.plugins.python(), api.system.blender(false), api.system.motionProviders(), api.system.info()]).then(([python, blender, providers, info]) => {
      if (active) setExtras({ python, blender, providers, platform: info.platform });
    });
    return () => {
      active = false;
    };
  }, []);

  const recommendations = useMemo(() => recommend(plugins, hardware, extras?.python ?? null, extras?.platform), [plugins, hardware, extras]);
  const chosen = selected ?? recommendations.filter((entry) => entry.fit === "recommended").map((entry) => entry.plugin.id);
  const chosenPlugins = plugins.filter((plugin) => chosen.includes(plugin.id));
  const diskGb = estimateDiskGb(chosenPlugins, weights);
  const freeGb = hardware?.diskFreeBytes ? hardware.diskFreeBytes / 1024 ** 3 : null;
  const missing = t("onboarding.missing");

  const facts: [string, string][] = [
    [t("settings.hardware.gpu"), hardware?.gpu ?? missing],
    [t("settings.hardware.vram"), hardware?.vramMb ? `${number.format(hardware.vramMb / 1024)} GB` : missing],
    [t("settings.hardware.cuda"), hardware?.cuda ?? missing],
    [t("settings.hardware.disk"), freeGb !== null ? `${number.format(freeGb)} GB` : missing],
    [t("onboarding.python"), extras ? (extras.python ?? t("onboarding.pythonMissing")) : "…"],
    [t("onboarding.blender"), extras ? (extras.blender ? extras.blender.version : t("onboarding.blenderMissing")) : "…"],
    [t("onboarding.clis"), extras ? extras.providers.filter((p) => p.available).map((p) => p.id).join(", ") || t("onboarding.clisMissing") : "…"],
  ];

  return (
    <DialogContent style={{ maxWidth: "46rem" }}>
      <DialogHeader>
        <DialogTitle>{t("onboarding.title")}</DialogTitle>
        <DialogDescription>{t(`onboarding.steps.${step}`)}</DialogDescription>
      </DialogHeader>

      {step === "hardware" && (
        <div className={styles.stack}>
          <dl className={styles.facts}>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <span className={styles.hint}>{hardware?.cuda ? t("onboarding.gpuReady") : t("onboarding.gpuMissing")}</span>
        </div>
      )}

      {step === "engines" && (
        <div className={styles.stack}>
          <ul className={styles.list} aria-label={t("onboarding.enginesLabel")}>
            {recommendations.map(({ plugin, fit, reason }) => {
              const id = `onboarding-${plugin.id}`;
              const selectable = fit === "recommended" || fit === "optional";
              return (
                <li key={plugin.id} className={styles.item}>
                  <Checkbox
                    id={id}
                    checked={chosen.includes(plugin.id) || fit === "installed"}
                    disabled={!selectable}
                    onCheckedChange={(value) => setSelected(value === true ? [...chosen, plugin.id] : chosen.filter((entry) => entry !== plugin.id))}
                  />
                  <div className={styles.itemText}>
                    <Label htmlFor={id}>
                      {plugin.name} <Badge variant={fit === "recommended" ? "default" : "outline"}>{t(`onboarding.fit.${fit}`)}</Badge>
                    </Label>
                    <span className={styles.hint}>{localized(plugin.description, i18n.language)}</span>
                    {reason && <span className={styles.warn}>{t(`onboarding.reason.${reason}`, { vram: plugin.requirements.vramGb })}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <span className={styles.hint}>
            {t("onboarding.disk", { size: number.format(diskGb), free: freeGb !== null ? number.format(freeGb) : "?" })}
          </span>
          {chosenPlugins.length > 0 && (
            <div className={styles.licenses}>
              <strong>{t("plugins.licenses")}</strong>
              {chosenPlugins.map((plugin) => (
                <span key={plugin.id}>
                  <b>{plugin.name}</b>: {plugin.licenseNotice ? localized(plugin.licenseNotice, i18n.language) : plugin.license}
                </span>
              ))}
              <div className={styles.item}>
                <Checkbox id="onboarding-accept" checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} />
                <Label htmlFor="onboarding-accept">{t("onboarding.accept")}</Label>
              </div>
            </div>
          )}
        </div>
      )}

      {(step === "install" || step === "done") && (
        <div className={styles.stack}>
          <ul className={styles.list} aria-label={t("onboarding.progressLabel")}>
            {queue.map((id) => {
              const plugin = plugins.find((entry) => entry.id === id);
              const own = weights.filter((entry) => plugin?.weights.some((w) => w.id === entry.id));
              const total = own.reduce((sum, entry) => sum + entry.sizeBytes, 0);
              const done = own.reduce((sum, entry) => sum + (entry.status === "installed" ? entry.sizeBytes : entry.downloadedBytes), 0);
              const status = failed.includes(id)
                ? t("onboarding.failed", { error: plugin?.error ?? "" })
                : plugin?.status === "installing"
                  ? t(`plugins.stage.${plugin.stage ?? "preparing"}`, { defaultValue: plugin.stage ?? "" })
                  : plugin?.status === "installed"
                    ? total > 0 && done < total
                      ? t("onboarding.weights", { percent: Math.round((100 * done) / total) })
                      : t("onboarding.ready")
                    : id === current
                      ? t("plugins.stage.preparing")
                      : t("onboarding.waiting");
              return (
                <li key={id} className={styles.progressItem}>
                  <span>
                    <b>{plugin?.name ?? id}</b> · {status}
                  </span>
                  {plugin?.status === "installed" && total > 0 && <Progress value={(100 * done) / total} aria-label={t("onboarding.weightsLabel", { name: plugin.name })} />}
                </li>
              );
            })}
          </ul>
          <span className={styles.hint}>{current ? t("onboarding.background") : t("onboarding.finished", { count: engines.filter((e) => e.available && !e.builtin).length })}</span>
        </div>
      )}

      <DialogFooter>
        {step === "hardware" && (
          <>
            <Button variant="ghost" onClick={onClose}>{t("onboarding.skip")}</Button>
            <Button onClick={() => setStep("engines")}>{t("onboarding.next")}</Button>
          </>
        )}
        {step === "engines" && (
          <>
            <Button variant="ghost" onClick={() => setStep("hardware")}>{t("onboarding.back")}</Button>
            <Button variant="outline" onClick={onClose}>{t("onboarding.skip")}</Button>
            <Button disabled={chosenPlugins.length === 0 || !accepted} onClick={() => void installSelected(chosen)}>
              {t("onboarding.install", { count: chosenPlugins.length })}
            </Button>
          </>
        )}
        {(step === "install" || step === "done") && <Button onClick={onClose}>{current ? t("onboarding.continueBackground") : t("onboarding.close")}</Button>}
      </DialogFooter>
    </DialogContent>
  );
}

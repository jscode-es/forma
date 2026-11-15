"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Icon,
  Label,
  Switch,
} from "@kivora/nextjs";
import { Download, ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { refreshEngines, useJobsStore } from "@/feature/jobs";
import { useOnboardingStore } from "@/feature/onboarding";
import { LibraryDialogContent } from "@/feature/projects";
import { LanguageToggle, ThemeToggle } from "@/feature/settings";
import type { SystemInfo, UpdateState } from "@/lib/forma";
import styles from "../shell.module.css";
import type { ShellDialog } from "./side-menu";

const REPO = "https://github.com/jscode-es/forma";

type Props = { open: ShellDialog | null; onClose: () => void };

export function ShellDialogs({ open, onClose }: Props) {
  const onOpenChange = (value: boolean) => !value && onClose();

  return (
    <>
      <Dialog open={open === "settings"} onOpenChange={onOpenChange}>
        <SettingsContent />
      </Dialog>
      <Dialog open={open === "library"} onOpenChange={onOpenChange}>
        {open === "library" && <LibraryDialogContent onClose={onClose} />}
      </Dialog>
      <Dialog open={open === "help"} onOpenChange={onOpenChange}>
        <HelpContent />
      </Dialog>
    </>
  );
}

function SettingsContent() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    window.forma?.system.info().then(setInfo);
  }, []);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("settings.title")}</DialogTitle>
        <DialogDescription>{t("settings.description")}</DialogDescription>
      </DialogHeader>
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <Label>{t("settings.language")}</Label>
          <LanguageToggle />
        </div>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <Label>{t("settings.theme")}</Label>
          <ThemeToggle />
        </div>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <Label>{t("settings.dataDir")}</Label>
          <code className={styles.pathBox}>{info?.dataDir ?? "-"}</code>
          <span className={styles.hint}>{t("settings.dataDirHint")}</span>
          <Button
            variant="outline"
            size="sm"
            style={{ justifySelf: "start" }}
            disabled={!window.forma}
            onClick={() => window.forma?.system.openDataDir()}
          >
            <Icon icon={FolderOpen} size={15} />
            {t("settings.openDataDir")}
          </Button>
        </div>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <Label>{t("onboarding.title")}</Label>
          <span className={styles.hint}>{t("onboarding.reopenHint")}</span>
          <Button variant="outline" size="sm" style={{ justifySelf: "start" }} onClick={() => useOnboardingStore.getState().setOpen(true)}>
            {t("onboarding.reopen")}
          </Button>
        </div>
        <UpdatesSection />
        <HardwareSection />
      </div>
    </DialogContent>
  );
}

function UpdatesSection() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    const api = window.forma;
    if (!api) return;
    void api.updates.state().then(setState);
    return api.updates.onUpdate(setState);
  }, []);

  if (!state) return null;
  const busy = state.status === "checking" || state.status === "downloading";
  const status =
    state.status === "available"
      ? t("settings.updates.available", { version: state.version })
      : state.status === "downloading"
        ? t("settings.updates.downloading", { percent: Math.round((state.progress ?? 0) * 100) })
        : state.status === "downloaded"
          ? t("settings.updates.downloaded", { version: state.version })
          : state.status === "error"
            ? t("settings.updates.error", { message: state.error })
            : t(`settings.updates.status.${state.status as "idle" | "unsupported" | "checking" | "not-available"}`);

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <Label>{t("settings.updates.title")}</Label>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <Label htmlFor="updates-enabled" style={{ fontWeight: 400 }}>{t("settings.updates.automatic")}</Label>
        <Switch id="updates-enabled" checked={state.enabled} disabled={state.status === "unsupported"} onCheckedChange={(value) => void window.forma!.updates.setEnabled(value).then(setState)} />
      </div>
      <span className={styles.hint} role="status">{t("settings.updates.current", { version: state.current })} · {status}</span>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Button variant="outline" size="sm" disabled={busy || state.status === "unsupported"} onClick={() => void window.forma!.updates.check().then(setState)}>
          <Icon icon={RefreshCw} size={15} />
          {t("settings.updates.check")}
        </Button>
        {state.status === "available" && (
          <Button size="sm" onClick={() => void window.forma!.updates.download()}>
            <Icon icon={Download} size={15} />
            {state.canInstall ? t("settings.updates.download") : t("settings.updates.openRelease")}
          </Button>
        )}
        {state.status === "downloaded" && (
          <Button size="sm" onClick={() => void window.forma!.updates.install()}>
            {t("settings.updates.install")}
          </Button>
        )}
      </div>
      <span className={styles.hint}>{t("settings.updates.hint")}</span>
    </div>
  );
}

function HardwareSection() {
  const { t, i18n } = useTranslation();
  const hardware = useJobsStore((s) => s.hardware);
  const engines = useJobsStore((s) => s.engines);
  const [checking, setChecking] = useState(false);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const missing = t("settings.hardware.notFound");

  const rows: [string, string][] = [
    [t("settings.hardware.gpu"), hardware?.gpu ?? missing],
    [t("settings.hardware.vram"), hardware?.vramMb ? `${number.format(hardware.vramMb / 1024)} GB` : missing],
    [t("settings.hardware.driver"), hardware?.driver ?? missing],
    [t("settings.hardware.cuda"), hardware?.cuda ?? missing],
    [t("settings.hardware.disk"), hardware?.diskFreeBytes ? `${number.format(hardware.diskFreeBytes / 1024 ** 3)} GB` : missing],
    [t("settings.hardware.python"), hardware?.python ? `${hardware.python.version} · ${hardware.python.path}` : missing],
  ];

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <Label>{t("settings.hardware.title")}</Label>
      <dl className={styles.facts}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>{t("settings.hardware.engines")}</dt>
          <dd>{engines.map((e) => `${e.name}${e.available ? "" : ` (${t(`engine.problem.${e.problem}`, { defaultValue: e.problem ?? "" })})`}`).join(", ") || missing}</dd>
        </div>
      </dl>
      <span className={styles.hint}>{t("settings.hardware.enginesHint")}</span>
      <Button
        variant="outline"
        size="sm"
        style={{ justifySelf: "start" }}
        disabled={checking || !window.forma}
        onClick={async () => {
          setChecking(true);
          await refreshEngines(true).finally(() => setChecking(false));
        }}
      >
        <Icon icon={RefreshCw} size={15} />
        {t("settings.hardware.refresh")}
      </Button>
    </div>
  );
}

function HelpContent() {
  const { t } = useTranslation();
  const links = [
    { label: t("help.docs"), href: `${REPO}#readme` },
    { label: t("help.phases"), href: `${REPO}/blob/dev/docs/phases.md` },
    { label: t("help.issue"), href: `${REPO}/issues/new/choose` },
  ];

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("help.title")}</DialogTitle>
        <DialogDescription>{t("help.description")}</DialogDescription>
      </DialogHeader>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {links.map((l) => (
          <Button key={l.href} asChild variant="outline" style={{ justifyContent: "space-between" }}>
            <a href={l.href} target="_blank" rel="noreferrer">
              {l.label}
              <Icon icon={ExternalLink} size={15} />
            </a>
          </Button>
        ))}
      </div>
    </DialogContent>
  );
}

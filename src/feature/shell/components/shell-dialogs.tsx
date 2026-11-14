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
} from "@kivora/nextjs";
import { ExternalLink, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LibraryDialogContent } from "@/feature/projects";
import { LanguageToggle, ThemeToggle } from "@/feature/settings";
import type { SystemInfo } from "@/lib/forma";
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
      </div>
    </DialogContent>
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

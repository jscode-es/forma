"use client";

import { useMemo } from "react";
import { Button, Icon, Textarea } from "@kivora/nextjs";
import { Check, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, EngineControl, generateImages, pickCandidate, useJobsStore, type Candidates } from "@/feature/jobs";
import { useBlobUrl } from "@/hooks/use-blob-url";
import type { PromptEntry } from "@/lib/forma";
import { useProjectStore } from "@/stores/project-store";
import styles from "../prompt.module.css";

function Candidate({ candidates, file, index }: { candidates: Candidates; file: Candidates["files"][number]; index: number }) {
  const { t } = useTranslation();
  const url = useBlobUrl(`${candidates.jobId}:${file.path}`, () => window.forma?.jobs.readFile(candidates.jobId, file.path));
  const picked = candidates.picked === file.path;
  const label = file.seed === null ? t("prompt.useImage", { index: index + 1 }) : t("prompt.use", { seed: file.seed });

  return (
    <button
      type="button"
      className={`${styles.candidate} ${picked ? styles.picked : ""}`}
      aria-pressed={picked}
      aria-label={label}
      title={label}
      onClick={() => pickCandidate(file.path)}
    >
      {url ? <img src={url} alt="" /> : <span className={styles.placeholder} />}
      <span className={styles.caption}>
        {picked && <Icon icon={Check} size={12} />}
        {picked ? t("prompt.picked") : file.seed === null ? index + 1 : t("prompt.seed", { seed: file.seed })}
      </span>
    </button>
  );
}

export function PromptControl() {
  const { t } = useTranslation();
  const prompt = useProjectStore((s) => s.prompt);
  const setPrompt = useProjectStore((s) => s.setPrompt);
  const sessionId = useProjectStore((s) => s.sessionId);
  const engineId = useProjectStore((s) => s.imageEngine.id);
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId && e.tasks.includes("text-to-image")));
  const job = useJobsStore((s) => s.jobs.find((j) => ACTIVE.has(j.status) && j.task === "text-to-image"));
  const candidates = useJobsStore((s) => (s.candidates?.sessionId === sessionId ? s.candidates : null));
  const ready = Boolean(engine?.available) && prompt.trim().length > 0 && !job;

  return (
    <div className={styles.stack}>
      <div className={styles.field}>
        <Textarea
          id="prompt-text"
          aria-label={t("prompt.label")}
          value={prompt}
          maxLength={1000}
          minRows={3}
          maxRows={8}
          autoResize
          placeholder={t("prompt.placeholder")}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ready) {
              e.preventDefault();
              void generateImages();
            }
          }}
        />
      </div>
      <EngineControl task="text-to-image" />
      {engine?.network && <span className={styles.hint}>{t("prompt.networkHint")}</span>}
      {candidates && candidates.files.length > 0 && (
        <div className={styles.field}>
          <span className={styles.subtitle}>{t("prompt.candidates")}</span>
          <div className={styles.grid} role="group" aria-label={t("prompt.candidates")}>
            {candidates.files.map((file, index) => (
              <Candidate key={file.path} candidates={candidates} file={file} index={index} />
            ))}
          </div>
          {!candidates.picked && <span className={styles.hint}>{t("prompt.pickHint")}</span>}
        </div>
      )}
    </div>
  );
}

function reuse(entry: PromptEntry) {
  const project = useProjectStore.getState();
  project.setPrompt(entry.text);
  project.setImageEngine({ id: entry.engineId, parameters: { ...entry.params } });
}

export function PromptHistory() {
  const { t, i18n } = useTranslation();
  const prompts = useProjectStore((s) => s.prompts);
  const engines = useJobsStore((s) => s.engines);
  const names = useMemo(() => new Map(engines.map((e) => [e.id, e.name])), [engines]);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }), [i18n.language]);

  if (prompts.length === 0) return <p className={styles.hint}>{t("prompt.historyEmpty")}</p>;

  return (
    <ul className={styles.history}>
      {prompts.map((entry) => {
        const details = [
          typeof entry.params.seed === "number" ? t("prompt.seed", { seed: entry.params.seed }) : null,
          typeof entry.params.count === "number" ? t("prompt.images", { count: entry.params.count }) : null,
          names.get(entry.engineId) ?? entry.engineId,
          date.format(new Date(entry.createdAt)),
        ].filter(Boolean);
        return (
          <li key={entry.id} className={styles.entry}>
            <div className={styles.entryText}>
              <span className={styles.promptText}>{entry.text}</span>
              <span className={styles.hint}>{details.join(" · ")}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("prompt.reuseLabel", { text: entry.text.slice(0, 60) })}
              title={t("prompt.reuse")}
              onClick={() => reuse(entry)}
            >
              <Icon icon={RotateCcw} size={14} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

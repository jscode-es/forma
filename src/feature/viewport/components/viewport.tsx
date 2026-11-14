"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
} from "@kivora/nextjs";
import { Box, Camera, Grid3x3, MousePointer2, Scan, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "@/stores/project-store";
import { useWorkspaceStore, type ViewMode } from "@/stores/workspace-store";
import type { CameraPreset } from "../engine/viewer";
import { useViewerStore } from "../viewer-store";
import styles from "../viewport.module.css";
import { ViewportCanvas } from "./viewport-canvas";

const MODES: ViewMode[] = ["material", "solid", "wireframe"];
const PRESETS: CameraPreset[] = ["perspective", "front", "back", "left", "right", "top"];

export function Viewport() {
  const { t, i18n } = useTranslation();
  const model = useProjectStore((s) => s.model);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const setViewMode = useWorkspaceStore((s) => s.setViewMode);
  const showGrid = useWorkspaceStore((s) => s.showGrid);
  const setShowGrid = useWorkspaceStore((s) => s.setShowGrid);
  const { status, stats, error, requestCamera, dismissError } = useViewerStore();

  const number = new Intl.NumberFormat(i18n.language);
  const meters = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const modelName = model.type === "default-cube" ? t("scene.cube") : model.name;

  return (
    <div className={styles.viewport}>
      <div className={styles.header}>
        <span className={styles.label}>
          <Icon icon={Box} size={16} />
          {t("viewport.preview")}
        </span>
        <span className={styles.divider} />
        <span className={styles.muted}>{modelName}</span>
        <span className={styles.spacer} />
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as ViewMode)}
          aria-label={t("viewport.mode")}
        >
          {MODES.map((mode) => (
            <ToggleGroupItem key={mode} value={mode} size="sm">
              {t(`viewport.${mode}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className={styles.stage}>
        <ViewportCanvas className={styles.canvas} />

        {status === "loading" && (
          <div className={styles.loading}>
            <Spinner size="sm" label={t("viewport.loading")} />
          </div>
        )}

        {error && (
          <Alert variant="destructive" className={styles.error}>
            <AlertDescription>
              {t("viewport.error", { message: error })}
            </AlertDescription>
            <Button size="icon" variant="ghost" aria-label={t("common.close")} onClick={dismissError}>
              <Icon icon={X} size={15} />
            </Button>
          </Alert>
        )}

        {stats && (
          <div className={styles.stats} aria-label={t("viewport.statsLabel")}>
            <span>{t("stats.vertices", { value: number.format(stats.vertices) })}</span>
            <span>{t("stats.triangles", { value: number.format(stats.triangles) })}</span>
            <span>
              {meters.format(stats.size.x)} × {meters.format(stats.size.y)} × {meters.format(stats.size.z)} m
            </span>
            <span>{t("stats.textures", { value: number.format(stats.textures) })}</span>
          </div>
        )}

        <div className={styles.toolbarArea}>
          <div className={styles.toolbar}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("viewport.frame")}
              title={t("viewport.frame")}
              onClick={() => requestCamera("perspective")}
            >
              <Icon icon={Scan} size={16} />
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label={t("viewport.camera")} title={t("viewport.camera")}>
                  <Icon icon={Camera} size={16} />
                </Button>
              </MenuTrigger>
              <MenuContent>
                {PRESETS.map((preset) => (
                  <MenuItem key={preset} onSelect={() => requestCamera(preset)}>
                    {t(`viewport.presets.${preset}`)}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <Button
              size="icon"
              variant={showGrid ? "secondary" : "ghost"}
              aria-label={t("viewport.grid")}
              aria-pressed={showGrid}
              title={t("viewport.grid")}
              onClick={() => setShowGrid(!showGrid)}
            >
              <Icon icon={Grid3x3} size={16} />
            </Button>
          </div>
          <span className={styles.hint}>
            <Icon icon={MousePointer2} size={12} />
            {t("viewport.hint")}
          </span>
        </div>
      </div>
    </div>
  );
}

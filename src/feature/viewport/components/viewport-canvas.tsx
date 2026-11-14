"use client";

import { useEffect, useRef } from "react";
import { useKivoraTheme } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import type { ModelSource, SceneModel } from "@/lib/forma";
import { displayedVariant, useProjectStore } from "@/stores/project-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { computeStats, createDefaultCube, parseGlb } from "../engine/models";
import { disposeObject, Viewer } from "../engine/viewer";
import { useViewerStore } from "../viewer-store";

function sourceOf(model: SceneModel, projectId: string | null): ModelSource | null {
  if (model.type === "staged") return { type: "staged", stagingId: model.stagingId };
  if (model.type === "asset" && projectId) return { type: "asset", projectId, assetId: model.assetId };
  return null;
}

export function ViewportCanvas({ className }: { className?: string }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const lastGood = useRef<SceneModel | null>(null);
  const variant = useProjectStore(displayedVariant);
  const model = variant.model;
  const projectId = useProjectStore((s) => s.id);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const showGrid = useWorkspaceStore((s) => s.showGrid);
  const cameraRequest = useViewerStore((s) => s.cameraRequest);
  const { resolvedColorMode } = useKivoraTheme();
  const cubeName = t("scene.cube");

  useEffect(() => {
    const viewer = new Viewer(containerRef.current!);
    viewerRef.current = viewer;
    // A new viewer starts empty (React may remount it), so the model must load again.
    lastGood.current = null;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => viewerRef.current?.setViewMode(viewMode), [viewMode]);
  useEffect(() => viewerRef.current?.setGridVisible(showGrid), [showGrid]);
  useEffect(() => viewerRef.current?.setDarkTheme(resolvedColorMode === "dark"), [resolvedColorMode]);
  useEffect(() => {
    if (cameraRequest) viewerRef.current?.setCameraPreset(cameraRequest.preset);
  }, [cameraRequest]);

  useEffect(() => {
    const viewer = viewerRef.current;
    // A failed import reverts the store to the model already on screen; nothing to reload.
    if (!viewer || model === lastGood.current) return;
    let cancelled = false;
    useViewerStore.setState({ status: "loading" });

    (async () => {
      try {
        const source = sourceOf(model, projectId);
        if (model.type !== "default-cube" && !source) throw new Error("Model source unavailable");
        const object = source ? await parseGlb(await window.forma!.models.read(source)) : createDefaultCube(cubeName);
        if (cancelled) {
          disposeObject(object);
          return;
        }
        viewer.setModel(object);
        lastGood.current = model;
        const stats = computeStats(object);
        useViewerStore.setState({ status: "ready", stats, error: null });
        useProjectStore.getState().recordTriangles(variant.id, stats.triangles);
      } catch (error) {
        if (cancelled) return;
        useViewerStore.setState({
          status: lastGood.current ? "ready" : "error",
          error: error instanceof Error ? error.message : String(error),
        });
        const store = useProjectStore.getState();
        if (variant.id === store.activeVariantId && variant.parentId) store.applyVariant(variant.parentId);
        store.discardVariant(variant.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [model, projectId, cubeName]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className={className} />;
}

"use client";

import { useEffect, useRef } from "react";
import { useKivoraTheme } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import type { ModelSource, SceneModel } from "@/lib/forma";
import { beginPaintStroke, endPaintStroke, movePaintStroke, usePaintStore } from "@/feature/paint";
import { recordAnimationFrame, sampleAnimationTrack, useAnimationStore } from "@/feature/animation";
import { recordRigModel, useRigStore } from "@/feature/rigging";
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
  const loadedSession = useRef<string | null>(null);
  const rigMetadata = useRef<{ sessionId: string; variantId: string; model: SceneModel } | null>(null);
  const variant = useProjectStore(displayedVariant);
  const model = variant.model;
  const projectId = useProjectStore((s) => s.id);
  const viewMode = useWorkspaceStore((s) => s.viewMode);
  const showGrid = useWorkspaceStore((s) => s.showGrid);
  const cameraRequest = useViewerStore((s) => s.cameraRequest);
  const projection = useViewerStore((s) => s.projection);
  const references = useProjectStore((s) => s.references);
  const sessionId = useProjectStore((s) => s.sessionId);
  const isolation = useViewerStore((s) => s.materialIsolation);
  const materialIndex = isolation?.sessionId === sessionId && isolation.variantId === variant.id ? isolation.materialIndex : null;
  const projectionView = projection?.sessionId === sessionId ? references.find((r) => r.id === projection.referenceId)?.view ?? null : null;
  const { resolvedColorMode } = useKivoraTheme();
  const cubeName = t("scene.cube");

  useEffect(() => {
    const viewer = new Viewer(containerRef.current!);
    viewerRef.current = viewer;
    // A new viewer starts empty (React may remount it), so the model must load again.
    lastGood.current = null;
    rigMetadata.current = null;
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
  useEffect(() => viewerRef.current?.setProjection(projectionView), [projectionView]);
  useEffect(() => viewerRef.current?.setMaterialIsolation(materialIndex), [materialIndex]);

  useEffect(() => {
    const syncPaint = () => {
      const project = useProjectStore.getState();
      const displayed = displayedVariant(project);
      const paint = usePaintStore.getState();
      const ready = useViewerStore.getState().status === "ready"
        && lastGood.current === displayed.model && loadedSession.current === project.sessionId;
      const draft = paint.draft;
      const rig = useRigStore.getState();
      const showingWeights = !project.comparing && rig.sessionId === project.sessionId && rig.variantId === displayed.id && rig.showWeights;
      viewerRef.current?.configurePaint(ready && !showingWeights && draft?.sessionId === project.sessionId && draft.variantId === displayed.id ? {
        canvas: draft.canvas,
        materialIndex: draft.materialIndex,
        enabled: paint.enabled && !paint.busy && !paint.blocked && !project.comparing,
        onBegin: beginPaintStroke,
        onMove: movePaintStroke,
        onEnd: endPaintStroke,
      } : null);
    };
    const unsubscribePaint = usePaintStore.subscribe(syncPaint);
    const unsubscribeProject = useProjectStore.subscribe(syncPaint);
    const unsubscribeViewer = useViewerStore.subscribe(syncPaint);
    const unsubscribeRig = useRigStore.subscribe(syncPaint);
    syncPaint();
    return () => {
      unsubscribePaint();
      unsubscribeProject();
      unsubscribeViewer();
      unsubscribeRig();
      viewerRef.current?.configurePaint(null);
    };
  }, []);

  useEffect(() => {
    const syncRig = () => {
      const project = useProjectStore.getState();
      const displayed = displayedVariant(project);
      const viewer = viewerRef.current;
      const ready = useViewerStore.getState().status === "ready"
        && lastGood.current === displayed.model && loadedSession.current === project.sessionId;
      if (viewer && ready && (rigMetadata.current?.model !== displayed.model || rigMetadata.current.sessionId !== project.sessionId || rigMetadata.current.variantId !== displayed.id)) {
        rigMetadata.current = { sessionId: project.sessionId, variantId: displayed.id, model: displayed.model };
        recordRigModel({ sessionId: project.sessionId, variantId: displayed.id, ...viewer.getRigMetadata() });
      }
      const rig = useRigStore.getState();
      viewer?.configureRig(ready && !project.comparing && rig.sessionId === project.sessionId && rig.variantId === displayed.id ? rig : null);
    };
    const unsubscribeRig = useRigStore.subscribe(syncRig);
    const unsubscribeProject = useProjectStore.subscribe(syncRig);
    const unsubscribeViewer = useViewerStore.subscribe(syncRig);
    syncRig();
    return () => {
      unsubscribeRig();
      unsubscribeProject();
      unsubscribeViewer();
      viewerRef.current?.configureRig(null);
    };
  }, []);

  useEffect(() => {
    const syncAnimation = () => {
      const project = useProjectStore.getState();
      const displayed = displayedVariant(project);
      const animation = useAnimationStore.getState();
      const ready = useViewerStore.getState().status === "ready"
        && lastGood.current === displayed.model && loadedSession.current === project.sessionId;
      viewerRef.current?.configureAnimation(ready && !project.comparing && !animation.blocked && !animation.busy
        && animation.sessionId === project.sessionId && animation.variantId === displayed.id && animation.draft ? {
          draft: animation.draft,
          sampleTrack: sampleAnimationTrack,
          frame: animation.frame,
          playing: animation.playing,
          loop: animation.loop,
          speed: animation.speed,
          onFrame: recordAnimationFrame,
        } : null);
    };
    const unsubscribeAnimation = useAnimationStore.subscribe(syncAnimation);
    const unsubscribeProject = useProjectStore.subscribe(syncAnimation);
    const unsubscribeViewer = useViewerStore.subscribe(syncAnimation);
    syncAnimation();
    return () => {
      unsubscribeAnimation();
      unsubscribeProject();
      unsubscribeViewer();
      viewerRef.current?.configureAnimation(null);
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    // A failed import reverts the store to the model already on screen; nothing to reload.
    if (!viewer || (model === lastGood.current && loadedSession.current === sessionId)) return;
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
        loadedSession.current = sessionId;
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
  }, [model, projectId, sessionId, cubeName]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className={className} />;
}

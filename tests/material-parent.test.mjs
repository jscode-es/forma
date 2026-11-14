import assert from "node:assert/strict";
import test from "node:test";
import { useProjectStore, DEFAULT_SETTINGS, currentScene } from "../src/stores/project-store.ts";

test("material previews preserve the explicit source when active selection changes", () => {
  const store = useProjectStore.getState();
  store.newProject();
  const source = useProjectStore.getState().activeVariantId;
  const input = { label: "Other model", origin: "import", engineId: null, model: { type: "default-cube" }, lods: [], params: {} };
  store.addVariant(input, true);
  const active = useProjectStore.getState().activeVariantId;
  store.addVariant({ ...input, origin: "material" }, false, source);
  const state = useProjectStore.getState();
  assert.equal(state.activeVariantId, active);
  assert.equal(state.variants.at(-1).parentId, source);
});

test("deleted source variants cannot acquire new material previews", () => {
  const store = useProjectStore.getState();
  const before = store.variants.length;
  store.addVariant({ label: "Orphan", origin: "material", engineId: null, model: { type: "default-cube" }, lods: [], params: {} }, false, crypto.randomUUID());
  assert.equal(useProjectStore.getState().variants.length, before);
});

test("variant limit preserves the source of a new material preview", () => {
  const template = useProjectStore.getState().variants[0];
  const variants = Array.from({ length: 24 }, () => ({ ...template, id: crypto.randomUUID() }));
  useProjectStore.setState({ variants, activeVariantId: variants[23].id, previewVariantId: null });
  useProjectStore.getState().addVariant({ label: "Edit", origin: "material", engineId: null, model: template.model, lods: [], params: {} }, false, variants[0].id);
  assert.ok(useProjectStore.getState().variants.some((v) => v.id === variants[0].id));
  assert.equal(useProjectStore.getState().variants.length, 24);
});

test("pending texture sources survive unrelated variant creation at the limit", () => {
  const template = useProjectStore.getState().variants[0];
  const variants = Array.from({ length: 24 }, () => ({ ...template, id: crypto.randomUUID() }));
  useProjectStore.setState({ variants, activeVariantId: variants[23].id, previewVariantId: null });
  useProjectStore.getState().retainVariant(variants[0].id);
  useProjectStore.getState().addVariant({ label: "Another", origin: "import", engineId: null, model: template.model, lods: [], params: {} }, true);
  assert.ok(useProjectStore.getState().variants.some((v) => v.id === variants[0].id));
  useProjectStore.getState().discardVariant(variants[0].id);
  assert.ok(useProjectStore.getState().variants.some((v) => v.id === variants[0].id));
  useProjectStore.getState().releaseVariant(variants[0].id);
});

test("saving preserves the session, pending sources and preview", () => {
  const initial = useProjectStore.getState();
  initial.addVariant({ label: "Preview", origin: "material", engineId: null, model: initial.variants[0].model, lods: [], params: {} }, false);
  const store = useProjectStore.getState();
  const sessionId = store.sessionId;
  const previewId = store.previewVariantId;
  assert.ok(previewId);
  store.retainVariant(store.activeVariantId);
  const retained = useProjectStore.getState().retainedVariantIds;
  const snapshot = { name: store.name, settings: DEFAULT_SETTINGS, scene: currentScene() };
  store.acceptSaved({ id: crypto.randomUUID(), name: "Saved", createdAt: "", updatedAt: "", settings: DEFAULT_SETTINGS, scene: snapshot.scene }, snapshot);
  assert.equal(useProjectStore.getState().sessionId, sessionId);
  assert.equal(useProjectStore.getState().previewVariantId, previewId);
  assert.deepEqual(useProjectStore.getState().retainedVariantIds, retained);
});

test("a save response keeps variants completed after the save started", () => {
  const state = useProjectStore.getState();
  const snapshot = { name: state.name, settings: DEFAULT_SETTINGS, scene: currentScene() };
  state.addVariant({ label: "Finished during save", origin: "texture", engineId: null, model: state.variants[0].model, lods: [], params: {} }, false);
  const preview = useProjectStore.getState().previewVariantId;
  state.acceptSaved({ id: crypto.randomUUID(), name: "Saved", createdAt: "", updatedAt: "", settings: DEFAULT_SETTINGS, scene: snapshot.scene }, snapshot);
  assert.ok(useProjectStore.getState().variants.some((v) => v.id === preview));
  assert.equal(useProjectStore.getState().dirty, true);
});

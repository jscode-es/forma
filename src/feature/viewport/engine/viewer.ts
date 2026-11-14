import {
  ACESFilmicToneMapping,
  Box3,
  Bone,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  GridHelper,
  Group,
  HemisphereLight,
  Material,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Sphere,
  SphereGeometry,
  SkeletonHelper,
  SkinnedMesh,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { AnimationClipData, AnimationTrack } from "@/lib/forma";

export type ViewMode = "material" | "solid" | "wireframe";
export type CameraPreset = "perspective" | "front" | "back" | "left" | "right" | "top";

const PRESET_DIRECTIONS: Record<CameraPreset, Vector3> = {
  perspective: new Vector3(1, 0.75, 1.25).normalize(),
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
  top: new Vector3(0, 1, 0.0001).normalize(),
};

const WIREFRAME_TAG = "forma:wireframe";
const GUIDE_LINKS = [
  ["hips", "spine"], ["spine", "chest"], ["chest", "neck"], ["neck", "head"],
  ...["left", "right"].flatMap((side) => [["chest", `${side}Shoulder`], [`${side}Shoulder`, `${side}Elbow`], [`${side}Elbow`, `${side}Wrist`], ["hips", `${side}Hip`], [`${side}Hip`, `${side}Knee`], [`${side}Knee`, `${side}Ankle`], [`${side}Ankle`, `${side}Toe`]]),
];

type AnimationConfiguration = {
  draft: AnimationClipData;
  sampleTrack: (track: AnimationTrack, frame: number) => number[];
  frame: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  onFrame: (frame: number, playing: boolean) => void;
};

type PaintUV = { u: number; v: number };
type RigConfiguration = {
  guides: Record<string, [number, number, number]>;
  showGuides: boolean;
  showBones: boolean;
  showWeights: boolean;
  selectedBone: number;
  pose: [number, number, number];
};
type PaintConfiguration = {
  canvas: HTMLCanvasElement;
  materialIndex: number;
  enabled: boolean;
  onBegin: (uv: PaintUV, clonePick: boolean) => void;
  onMove: (uv: PaintUV) => void;
  onEnd: (cancel?: boolean) => void;
};

export class Viewer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.01, 1000);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.001, 10000);
  private projection: CameraPreset | null = null;
  private materialIsolation: number | null = null;
  private readonly controls: OrbitControls;
  private readonly root = new Group();
  private readonly clay = new MeshStandardMaterial({ color: 0xa8a8b0, roughness: 0.75, metalness: 0 });
  private readonly wire = new MeshBasicMaterial({ color: 0x111114, wireframe: true, transparent: true, opacity: 0.55 });
  private readonly resizeObserver: ResizeObserver;
  private grid: GridHelper;
  private gridCell = 1;
  private dark = true;
  private model: Object3D | null = null;
  private viewMode: ViewMode = "material";
  private frame = 0;
  private disposed = false;
  private paint: PaintConfiguration | null = null;
  private readonly paintTextures = new Set<CanvasTexture>();
  private readonly paintMaterials = new Map<Material, Material>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private paintPointer: number | null = null;
  private animation: AnimationConfiguration | null = null;
  private animationFrame = 0;
  private animationTick: number | null = null;
  private animationReportedFrame: number | null = null;
  private animationReportedAt = -Infinity;
  private rig: RigConfiguration | null = null;
  private readonly rigBones = new Map<Bone, { position: Vector3; quaternion: Quaternion; scale: Vector3; worldPosition: Vector3 }>();
  private readonly rigWeights = new Map<SkinnedMesh, { geometry: BufferGeometry; material: MeshBasicMaterial }>();
  private readonly rigOverlay = new Group();
  private rigBounds: Box3 | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0xffffff, 0x3a3a40, 0.35));
    const key = new DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 6, 4);
    this.scene.add(key);

    this.grid = this.createGrid();
    this.scene.add(this.grid, this.root, this.rigOverlay);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => this.requestRender());
    this.renderer.domElement.addEventListener("pointerdown", this.onPaintDown, true);
    this.renderer.domElement.addEventListener("pointermove", this.onPaintMove, true);
    this.renderer.domElement.addEventListener("pointerup", this.onPaintUp, true);
    this.renderer.domElement.addEventListener("pointercancel", this.onPaintCancel, true);
    this.renderer.domElement.addEventListener("lostpointercapture", this.onPaintLostCapture, true);

    this.camera.position.set(3, 2.2, 3.6);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setModel(object: Object3D) {
    this.configureAnimation(null);
    this.configureRig(null);
    this.rigBones.clear();
    this.rigBounds = null;
    this.configurePaint(null);
    if (this.model) {
      this.root.remove(this.model);
      disposeObject(this.model);
    }
    const box = new Box3().setFromObject(object);
    const center = box.getCenter(new Vector3());
    object.position.x -= center.x;
    object.position.z -= center.z;
    object.position.y -= box.min.y;

    const maxDim = Math.max(...box.getSize(new Vector3()).toArray(), 1e-6);
    this.gridCell = 10 ** Math.floor(Math.log10(maxDim));
    this.rebuildGrid();

    this.model = object;
    this.root.add(object);
    this.captureRig();
    this.applyViewMode();
    this.applyIsolation();
    if (this.projection) this.resize();
    else this.setCameraPreset("perspective");
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    this.applyViewMode();
  }

  setGridVisible(visible: boolean) {
    this.grid.visible = visible;
    this.requestRender();
  }

  setMaterialIsolation(index: number | null) {
    this.materialIsolation = index;
    this.applyIsolation();
  }

  private applyIsolation() {
    this.model?.traverse((node) => {
      if (!(node instanceof Mesh) || node.userData[WIREFRAME_TAG]) return;
      node.userData.formaOriginalVisible ??= node.visible;
      const original = node.userData.originalMaterial ?? node.material;
      const materials: Material[] = Array.isArray(original) ? original : [original];
      node.visible = node.userData.formaOriginalVisible && (this.materialIsolation === null || materials.some((m) => m.userData.formaMaterialIndex === this.materialIsolation));
    });
    this.requestRender();
  }

  setDarkTheme(dark: boolean) {
    this.dark = dark;
    this.rebuildGrid();
  }

  setCameraPreset(preset: CameraPreset) {
    if (this.projection) return;
    const sphere = this.model ? new Box3().setFromObject(this.model).getBoundingSphere(new Sphere()) : new Sphere(new Vector3(0, 0.5, 0), 1);
    const radius = Math.max(sphere.radius, 0.01);
    const distance = (radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.5;
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(PRESET_DIRECTIONS[preset], distance);
    this.controls.update();
    this.requestRender();
  }

  setProjection(preset: CameraPreset | null) {
    this.projection = preset;
    this.controls.enabled = preset === null && this.paintPointer === null;
    if (!preset) {
      this.setCameraPreset("perspective");
      return;
    }
    this.resize();
  }

  private updateProjection(width: number, height: number) {
    const box = this.model ? new Box3().setFromObject(this.model) : new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const span = Math.max(size.x, size.y, size.z, 0.01) * 1.25;
    const unit = Math.min(width, height);
    this.orthographic.left = -span * width / unit / 2;
    this.orthographic.right = -this.orthographic.left;
    this.orthographic.top = span * height / unit / 2;
    this.orthographic.bottom = -this.orthographic.top;
    this.orthographic.far = span * 100;
    this.orthographic.up.set(0, 1, 0);
    if (this.projection === "top") this.orthographic.up.set(0, 0, -1);
    this.orthographic.position.copy(center).addScaledVector(PRESET_DIRECTIONS[this.projection!], span * 5);
    this.orthographic.lookAt(center);
    this.orthographic.updateProjectionMatrix();
  }

  dispose() {
    this.configureAnimation(null);
    this.configureRig(null);
    this.configurePaint(null);
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPaintDown, true);
    this.renderer.domElement.removeEventListener("pointermove", this.onPaintMove, true);
    this.renderer.domElement.removeEventListener("pointerup", this.onPaintUp, true);
    this.renderer.domElement.removeEventListener("pointercancel", this.onPaintCancel, true);
    this.renderer.domElement.removeEventListener("lostpointercapture", this.onPaintLostCapture, true);
    if (this.model) disposeObject(this.model);
    this.grid.geometry.dispose();
    (this.grid.material as Material).dispose();
    this.clay.dispose();
    this.wire.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private rebuildGrid() {
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as Material).dispose();
    const visible = this.grid.visible;
    this.grid = this.createGrid();
    this.grid.visible = visible;
    this.scene.add(this.grid);
    this.requestRender();
  }

  private createGrid() {
    const dark = this.dark;
    const grid = new GridHelper(this.gridCell * 20, 20, new Color(dark ? 0x55555c : 0xa0a0a8), new Color(dark ? 0x2c2c32 : 0xd4d4da));
    (grid.material as Material).transparent = true;
    (grid.material as Material).opacity = 0.9;
    return grid;
  }

  private applyViewMode() {
    if (!this.model) return;
    this.model.traverse((node) => {
      if (!(node instanceof Mesh) || node.userData[WIREFRAME_TAG]) return;
      node.userData.originalMaterial ??= node.material;
      const original: Material | Material[] = node.userData.originalMaterial;
      node.material = node instanceof SkinnedMesh && this.rigWeights?.has(node)
        ? this.rigWeights.get(node)!.material
        : this.viewMode === "material"
        ? Array.isArray(original) ? original.map((material) => this.paintMaterials.get(material) ?? material) : this.paintMaterials.get(original) ?? original
        : this.clay;
      const overlay = node.children.find((c) => c.userData[WIREFRAME_TAG]);
      if (this.viewMode === "wireframe" && !this.rig?.showWeights && !overlay) {
        const lines = new Mesh(node.geometry, this.wire);
        lines.userData[WIREFRAME_TAG] = true;
        lines.raycast = () => {};
        node.add(lines);
      } else if ((this.viewMode !== "wireframe" || this.rig?.showWeights) && overlay) {
        node.remove(overlay);
      }
    });
    this.requestRender();
  }

  private captureRig() {
    if (!this.model) return;
    this.model.updateWorldMatrix(true, true);
    this.rigBounds ??= new Box3().setFromObject(this.model);
    this.model.traverse((node) => {
      if (node instanceof Bone && !this.rigBones.has(node)) {
        this.rigBones.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), worldPosition: node.getWorldPosition(new Vector3()) });
      }
    });
  }

  getRigMetadata() {
    this.captureRig();
    const bounds = this.rigBounds ?? new Box3(new Vector3(), new Vector3(1, 1, 1));
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const bones = [...this.rigBones.keys()].filter((bone) => Number.isInteger(bone.userData.formaJointIndex)).map((bone) => {
      const point = this.rigBones.get(bone)!.worldPosition;
      let parent = bone.parent;
      while (parent && !Number.isInteger(parent.userData.formaJointIndex)) parent = parent.parent;
      return {
        index: bone.userData.formaJointIndex as number,
        name: bone.name,
        parent: parent ? parent.userData.formaJointIndex as number : null,
        position: [(point.x - center.x) / Math.max(size.x, 1e-6), (point.y - bounds.min.y) / Math.max(size.y, 1e-6), (point.z - center.z) / Math.max(size.z, 1e-6)] as [number, number, number],
      };
    }).sort((a, b) => a.index - b.index);
    return { bones, clips: (this.model?.userData.formaClipNames ?? []) as string[], hasSkin: this.model?.userData.formaHasSkin === true };
  }

  configureAnimation(configuration: AnimationConfiguration | null) {
    const previous = this.animation;
    if (!configuration && !previous) return;
    this.captureRig();
    const changed = previous?.draft !== configuration?.draft;
    const scrubbed = configuration && configuration.frame !== previous?.frame
      && configuration.frame !== this.animationReportedFrame;
    this.animation = configuration;
    if (!configuration) {
      this.animationTick = null;
      this.animationReportedFrame = null;
      this.restoreRigPose(false);
      this.requestRender();
      return;
    }
    if (changed || scrubbed) this.animationFrame = Math.max(0, Math.min(configuration.draft.durationFrames, configuration.frame));
    if (changed || scrubbed || previous?.playing !== configuration.playing) this.animationTick = null;
    if (changed) {
      this.animationReportedFrame = null;
      this.animationReportedAt = -Infinity;
    }
    this.applyAnimation();
    this.requestRender();
  }

  private restoreRigPose(applyPose = true) {
    for (const [bone, rest] of this.rigBones) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion).normalize();
      bone.scale.copy(rest.scale);
      if (applyPose && this.rig && bone.userData.formaJointIndex === this.rig.selectedBone) {
        bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...this.rig.pose.map((value) => value * Math.PI / 180) as [number, number, number], "XYZ")));
      }
    }
    this.model?.updateWorldMatrix(true, true);
  }

  private applyAnimation() {
    if (!this.animation) return;
    const bones = new Map<string, Bone>();
    for (const [bone, rest] of this.rigBones) {
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion).normalize();
      bone.scale.copy(rest.scale);
      const index = bone.userData.formaJointIndex;
      if (Number.isInteger(index)) {
        const source = this.animation.draft.bones[index];
        if (source) bones.set(source.name, bone);
      }
    }
    for (const track of this.animation.draft.tracks) {
      const bone = bones.get(track.bone);
      if (!bone || !track.keys.length) continue;
      const value = this.animation.sampleTrack(track, this.animationFrame);
      if (track.path === "translation") bone.position.fromArray(value);
      else if (track.path === "rotation") bone.quaternion.fromArray(value).normalize();
      else bone.scale.fromArray(value);
    }
    this.model?.updateWorldMatrix(true, true);
  }

  private advanceAnimation(timestamp: number) {
    const animation = this.animation;
    if (!animation?.playing) return;
    const elapsed = this.animationTick === null ? 0 : Math.max(0, timestamp - this.animationTick) / 1000;
    this.animationTick = timestamp;
    this.animationFrame += elapsed * animation.draft.fps * animation.speed;
    let playing = true;
    if (this.animationFrame >= animation.draft.durationFrames) {
      if (animation.loop && animation.draft.durationFrames > 0) this.animationFrame %= animation.draft.durationFrames;
      else {
        this.animationFrame = animation.draft.durationFrames;
        this.animation = { ...animation, playing: false };
        playing = false;
      }
    }
    this.applyAnimation();
    if (!playing || timestamp - this.animationReportedAt >= 1000 / 30) {
      this.animationReportedAt = timestamp;
      this.animationReportedFrame = this.animationFrame;
      animation.onFrame(this.animationFrame, playing);
    }
  }

  configureRig(configuration: RigConfiguration | null) {
    this.captureRig();
    this.rig = configuration;
    this.rigWeights.forEach(({ geometry, material }, mesh) => {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      material.dispose();
    });
    this.rigWeights.clear();
    if (this.animation) this.applyAnimation();
    else this.restoreRigPose();
    this.model?.updateWorldMatrix(true, true);
    for (const child of [...this.rigOverlay.children]) {
      this.rigOverlay.remove(child);
      if (child instanceof SkeletonHelper) child.dispose();
      else if (child instanceof Mesh || child instanceof LineSegments) {
        child.geometry.dispose();
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
      }
    }
    if (configuration?.showBones && this.model && this.rigBones.size) {
      const helper = new SkeletonHelper(this.model);
      for (const material of Array.isArray(helper.material) ? helper.material : [helper.material]) {
        material.depthTest = false;
        material.transparent = true;
      }
      helper.renderOrder = 10;
      helper.raycast = () => {};
      this.rigOverlay.add(helper);
    }
    if (configuration?.showWeights) {
      this.finishPaint();
      this.model?.traverse((node) => {
        if (!(node instanceof SkinnedMesh)) return;
        const indices = node.geometry.getAttribute("skinIndex");
        const weights = node.geometry.getAttribute("skinWeight");
        if (!indices || !weights) return;
        const selected = node.skeleton.bones.findIndex((bone) => bone.userData.formaJointIndex === configuration.selectedBone);
        const colors = new Float32Array(indices.count * 3);
        for (let vertex = 0; vertex < indices.count; vertex++) {
          let influence = 0;
          let total = 0;
          for (let slot = 0; slot < 4; slot++) {
            const weight = weights.getComponent(vertex, slot);
            total += weight;
            if (indices.getComponent(vertex, slot) === selected) influence += weight;
          }
          const value = total > 0 ? influence / total : 0;
          colors[vertex * 3] = value;
          colors[vertex * 3 + 2] = 1 - value;
        }
        const geometry = node.geometry;
        node.geometry = geometry.clone();
        node.geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
        const material = new MeshBasicMaterial({ vertexColors: true });
        this.rigWeights.set(node, { geometry, material });
      });
    }
    if (configuration?.showGuides && this.rigBounds) {
      const size = this.rigBounds.getSize(new Vector3());
      const center = this.rigBounds.getCenter(new Vector3());
      const radius = Math.max(size.x, size.y, size.z) * .012;
      for (const point of Object.values(configuration.guides)) {
        const marker = new Mesh(new SphereGeometry(radius, 12, 8), new MeshBasicMaterial({ color: 0xf9bd45, depthTest: false }));
        marker.position.set(center.x + point[0] * size.x, this.rigBounds.min.y + point[1] * size.y, center.z + point[2] * size.z);
        marker.renderOrder = 11;
        marker.raycast = () => {};
        this.rigOverlay.add(marker);
      }
      const points: number[] = [];
      for (const [start, end] of GUIDE_LINKS) {
        const a = configuration.guides[start];
        const b = configuration.guides[end];
        if (!a || !b) continue;
        for (const point of [a, b]) points.push(center.x + point[0] * size.x, this.rigBounds.min.y + point[1] * size.y, center.z + point[2] * size.z);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
      const lines = new LineSegments(geometry, new LineBasicMaterial({ color: 0xf9bd45, depthTest: false }));
      lines.renderOrder = 10;
      lines.raycast = () => {};
      this.rigOverlay.add(lines);
    }
    this.applyViewMode();
    this.requestRender();
  }

  configurePaint(configuration: PaintConfiguration | null) {
    const changed = this.paint?.canvas !== configuration?.canvas || this.paint?.materialIndex !== configuration?.materialIndex;
    if (changed || !configuration?.enabled) this.finishPaint();
    this.paint = configuration;
    if (changed) {
      this.paintMaterials.forEach((material) => material.dispose());
      this.paintMaterials.clear();
      this.paintTextures.forEach((texture) => texture.dispose());
      this.paintTextures.clear();
      if (configuration && this.model) {
        this.model.traverse((node) => {
          if (!(node instanceof Mesh) || node.userData[WIREFRAME_TAG]) return;
          const original: Material | Material[] = node.userData.originalMaterial ?? node.material;
          for (const material of Array.isArray(original) ? original : [original]) {
            if (material.userData.formaMaterialIndex !== configuration.materialIndex || this.paintMaterials.has(material) || !(material instanceof MeshStandardMaterial)) continue;
            const texture = new CanvasTexture(configuration.canvas);
            if (material.map) {
              texture.wrapS = material.map.wrapS;
              texture.wrapT = material.map.wrapT;
              texture.magFilter = material.map.magFilter;
              texture.minFilter = material.map.minFilter;
              texture.anisotropy = material.map.anisotropy;
              texture.generateMipmaps = material.map.generateMipmaps;
              texture.channel = material.map.channel;
              texture.offset.copy(material.map.offset);
              texture.repeat.copy(material.map.repeat);
              texture.center.copy(material.map.center);
              texture.rotation = material.map.rotation;
              texture.matrix.copy(material.map.matrix);
              texture.matrixAutoUpdate = material.map.matrixAutoUpdate;
            }
            texture.colorSpace = SRGBColorSpace;
            texture.flipY = false;
            this.paintTextures.add(texture);
            const clone = material.clone();
            clone.map = texture;
            this.paintMaterials.set(material, clone);
          }
        });
      }
      this.applyViewMode();
    }
    this.refreshPaint();
  }

  refreshPaint() {
    this.paintTextures.forEach((texture) => { texture.needsUpdate = true; });
    this.requestRender();
  }

  private paintHit(event: PointerEvent): PaintUV | null {
    if (!this.model || !this.paint) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.model.updateWorldMatrix(true, true);
    const camera = this.projection ? this.orthographic : this.camera;
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, camera);
    for (const hit of this.raycaster.intersectObject(this.model, true)) {
      if (!(hit.object instanceof Mesh) || hit.object.userData[WIREFRAME_TAG]) continue;
      let visible = true;
      for (let node: Object3D | null = hit.object; node; node = node.parent) {
        if (!node.visible) visible = false;
      }
      if (!visible) continue;
      const original: Material | Material[] = hit.object.userData.originalMaterial ?? hit.object.material;
      const material = Array.isArray(original) ? original[hit.face?.materialIndex ?? 0] : original;
      if (!material?.visible) continue;
      if (material.userData.formaMaterialIndex !== this.paint.materialIndex || !hit.uv
        || !Number.isFinite(hit.uv.x) || !Number.isFinite(hit.uv.y)
        || hit.uv.x < 0 || hit.uv.x > 1 || hit.uv.y < 0 || hit.uv.y > 1) return null;
      return { u: hit.uv.x, v: hit.uv.y };
    }
    return null;
  }

  private onPaintDown = (event: PointerEvent) => {
    if (!this.paint?.enabled || this.rig?.showWeights || event.button !== 0 || this.paintPointer !== null) return;
    const uv = this.paintHit(event);
    if (!uv) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.paintPointer = event.pointerId;
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.paint.onBegin(uv, event.altKey);
  };

  private onPaintMove = (event: PointerEvent) => {
    if (event.pointerId !== this.paintPointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const uv = this.paintHit(event);
    if (uv) this.paint?.onMove(uv);
    else this.finishPaint();
  };

  private onPaintUp = (event: PointerEvent) => {
    if (event.pointerId !== this.paintPointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finishPaint();
  };

  private onPaintCancel = (event: PointerEvent) => {
    if (event.pointerId === this.paintPointer) this.finishPaint(true);
  };

  private onPaintLostCapture = (event: PointerEvent) => {
    if (event.pointerId === this.paintPointer) this.finishPaint();
  };

  private finishPaint(cancel = false) {
    if (this.paintPointer === null) return;
    const pointer = this.paintPointer;
    this.paintPointer = null;
    if (this.renderer.domElement.hasPointerCapture(pointer)) this.renderer.domElement.releasePointerCapture(pointer);
    this.controls.enabled = this.projection === null;
    this.paint?.onEnd(cancel);
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.projection) this.updateProjection(width, height);
    this.requestRender();
  }

  private requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame((timestamp) => {
      this.frame = 0;
      this.advanceAnimation(timestamp);
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.projection ? this.orthographic : this.camera);
      if (moving || this.animation?.playing) this.requestRender();
    });
  }
}

export function disposeObject(object: Object3D) {
  object.traverse((node) => {
    if (!(node instanceof Mesh) || node.userData[WIREFRAME_TAG]) return;
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
    (node.geometry as BufferGeometry).dispose();
    const original = node.userData.originalMaterial ?? node.material;
    for (const material of Array.isArray(original) ? original : [original]) {
      for (const value of Object.values(material as Record<string, unknown>)) {
        if (value instanceof Texture) value.dispose();
      }
      (material as Material).dispose();
    }
  });
}

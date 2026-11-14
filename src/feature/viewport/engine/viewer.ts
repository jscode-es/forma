import {
  ACESFilmicToneMapping,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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

export class Viewer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.01, 1000);
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
    this.scene.add(this.grid, this.root);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => this.requestRender());

    this.camera.position.set(3, 2.2, 3.6);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  setModel(object: Object3D) {
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
    this.applyViewMode();
    this.setCameraPreset("perspective");
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    this.applyViewMode();
  }

  setGridVisible(visible: boolean) {
    this.grid.visible = visible;
    this.requestRender();
  }

  setDarkTheme(dark: boolean) {
    this.dark = dark;
    this.rebuildGrid();
  }

  setCameraPreset(preset: CameraPreset) {
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

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
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
      node.material = this.viewMode === "material" ? node.userData.originalMaterial : this.clay;
      const overlay = node.children.find((c) => c.userData[WIREFRAME_TAG]);
      if (this.viewMode === "wireframe" && !overlay) {
        const lines = new Mesh(node.geometry, this.wire);
        lines.userData[WIREFRAME_TAG] = true;
        lines.raycast = () => {};
        node.add(lines);
      } else if (this.viewMode !== "wireframe" && overlay) {
        node.remove(overlay);
      }
    });
    this.requestRender();
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      if (moving) this.requestRender();
    });
  }
}

export function disposeObject(object: Object3D) {
  object.traverse((node) => {
    if (!(node instanceof Mesh) || node.userData[WIREFRAME_TAG]) return;
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

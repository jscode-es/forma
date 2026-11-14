import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type CaptureView = { id: string; label: string; direction: [number, number, number] };

export type CaptureViewId = "front" | "threeQuarter" | "side" | "back";

export const CAPTURE_VIEWS: (Omit<CaptureView, "label" | "id"> & { id: CaptureViewId })[] = [
  { id: "front", direction: [0, 0.18, 1] },
  { id: "threeQuarter", direction: [1, 0.45, 1] },
  { id: "side", direction: [1, 0.18, 0] },
  { id: "back", direction: [0, 0.18, -1] },
];

export type CaptureEntry = { object: Object3D; title: string; lines: string[] };

export type SheetText = { title: string; subtitle: string };

const CELL = 320;
const LABEL = 280;
const HEADER = 76;
const FOV = 30;
const BACKGROUND = "#232328";
const FOREGROUND = "#ececf1";
const MUTED = "#a1a1ad";
const ACCENT = "#b9a7ff";

function createStudio() {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(CELL, CELL, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new HemisphereLight(0xffffff, 0x3a3a40, 0.35));
  const key = new DirectionalLight(0xffffff, 0.9);
  key.position.set(3, 6, 4);
  scene.add(key);
  return { renderer, scene };
}

function frame(object: Object3D) {
  const box = new Box3().setFromObject(object);
  const center = box.getCenter(new Vector3());
  const radius = Math.max(box.getSize(new Vector3()).length() / 2, 1e-4);
  return { center, radius };
}

export async function renderComparison(entries: CaptureEntry[], views: CaptureView[], text: SheetText): Promise<Blob> {
  const { renderer, scene } = createStudio();
  const sheet = document.createElement("canvas");
  sheet.width = LABEL + views.length * CELL;
  sheet.height = HEADER + entries.length * CELL;
  const context = sheet.getContext("2d")!;
  context.fillStyle = "#18181c";
  context.fillRect(0, 0, sheet.width, sheet.height);

  context.fillStyle = FOREGROUND;
  context.font = "600 20px system-ui, sans-serif";
  context.fillText(text.title, 16, 30);
  context.fillStyle = MUTED;
  context.font = "13px system-ui, sans-serif";
  context.fillText(text.subtitle, 16, 54);
  views.forEach((view, index) => {
    context.fillStyle = MUTED;
    context.font = "600 13px system-ui, sans-serif";
    context.fillText(view.label, LABEL + index * CELL + 12, HEADER - 10);
  });

  const camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  try {
    for (const [row, entry] of entries.entries()) {
      const top = HEADER + row * CELL;
      const { center, radius } = frame(entry.object);
      const pivot = new Group();
      pivot.add(entry.object);
      entry.object.position.sub(center);
      scene.add(pivot);
      const distance = (radius / Math.sin(((FOV / 2) * Math.PI) / 180)) * 1.05;
      camera.near = distance / 100;
      camera.far = distance * 10;
      camera.updateProjectionMatrix();
      for (const [column, view] of views.entries()) {
        camera.position.set(...view.direction).normalize().multiplyScalar(distance);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        context.drawImage(renderer.domElement, LABEL + column * CELL, top, CELL, CELL);
      }
      scene.remove(pivot);

      context.fillStyle = row % 2 ? "#1c1c21" : "#1f1f24";
      context.fillRect(0, top, LABEL, CELL);
      context.fillStyle = ACCENT;
      context.fillRect(0, top, 3, CELL);
      context.fillStyle = FOREGROUND;
      context.font = "600 15px system-ui, sans-serif";
      context.fillText(fit(context, entry.title, LABEL - 32), 16, top + 30);
      context.font = "12px system-ui, sans-serif";
      context.fillStyle = MUTED;
      entry.lines.forEach((line, index) => context.fillText(fit(context, line, LABEL - 32), 16, top + 54 + index * 19));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    renderer.dispose();
    scene.environment?.dispose();
  }

  return new Promise((resolve, reject) => sheet.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture-failed"))), "image/png"));
}

function fit(context: CanvasRenderingContext2D, value: string, width: number) {
  if (context.measureText(value).width <= width) return value;
  let text = value;
  while (text.length > 1 && context.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  return `${text}…`;
}

import { app, BrowserWindow, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "./contract";
import { getSetting, setSetting } from "./db";

const RELEASES = "https://github.com/jscode-es/forma/releases";
const SETTING = "updates.check";

let state: UpdateState = { status: "idle", version: null, progress: null, error: null, enabled: true, canInstall: true, current: "" };
let configured = false;

function emit(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("updates:update", state);
}

function supported() {
  return app.isPackaged || Boolean(process.env.FORMA_UPDATE_URL);
}

function configure() {
  if (configured) return;
  configured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  const url = process.env.FORMA_UPDATE_URL ?? `${RELEASES}/latest/download`;
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.setFeedURL({ provider: "generic", url });
  autoUpdater.on("checking-for-update", () => emit({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) => emit({ status: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => emit({ status: "not-available", version: null }));
  autoUpdater.on("download-progress", (progress) => emit({ status: "downloading", progress: progress.percent / 100 }));
  autoUpdater.on("update-downloaded", (info) => emit({ status: "downloaded", version: info.version, progress: 1 }));
  autoUpdater.on("error", (error) => emit({ status: "error", error: error.message.split("\n")[0].slice(0, 300) }));
}

export function updateState(): UpdateState {
  const enabled = getSetting(SETTING) !== "off";
  const canInstall = process.platform !== "darwin" && !(process.platform === "linux" && !process.env.APPIMAGE && app.isPackaged);
  state = { ...state, enabled, canInstall, current: app.getVersion(), status: supported() ? state.status : "unsupported" };
  return state;
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!supported()) return updateState();
  configure();
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emit({ status: "error", error: error instanceof Error ? error.message.split("\n")[0].slice(0, 300) : String(error) });
  }
  return updateState();
}

export async function downloadUpdate() {
  if (state.status !== "available") throw new Error("No update available");
  if (!updateState().canInstall) {
    await shell.openExternal(`${RELEASES}/latest`);
    return;
  }
  await autoUpdater.downloadUpdate();
}

export function installUpdate() {
  if (state.status !== "downloaded") throw new Error("The update is not downloaded");
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

export function setUpdatesEnabled(enabled: boolean): UpdateState {
  setSetting(SETTING, enabled ? "on" : "off");
  return updateState();
}

export function checkOnStartup() {
  if (!supported() || getSetting(SETTING) === "off") return;
  setTimeout(() => void checkForUpdates(), 8000);
}

import { app, BrowserWindow, net, protocol, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { runCli } from "./cli";
import { openDb } from "./db";
import { animationClip } from "./animation-schema";
import { listAnimations, readAnimation, saveAnimation, deleteAnimation, importAnimation, exportAnimation } from "./animations";
import { importVideo } from "./videos";
import { saveCapture } from "./captures";
import { motionProviders } from "./providers";
import { checkForUpdates, checkOnStartup, downloadUpdate, installUpdate, setUpdatesEnabled, updateState } from "./updater";
import { chooseBlender, getBlender } from "./blender";
import { listEngines } from "./engines";
import { getHardware } from "./hardware";
import { handle } from "./ipc";
import { jobs } from "./jobs";
import {
  createProject,
  deleteProject,
  duplicateProject,
  lastProject,
  listProjects,
  openProject,
  renameProject,
  updateProject,
} from "./projects";
import { importReference, importReferenceBytes, readReference, stageReferenceBytes } from "./images";
import { clearStaging, exportModel, importModel, readModel, stageModelBytes } from "./models";
import { engineId, imageSource, jobRequest, modelSource, projectId, projectInput, projectName } from "./schemas";
import { cancelInstall, choosePython, listPlugins, startInstall, uninstallPlugin } from "./plugins";
import { getSystemInfo, openDataDir } from "./system";
import { acceptLicense, cancelDownload, checkUpdates, downloadWeights, listWeights, removeWeights, verifyWeights } from "./weights";

const isDev = process.env.FORMA_DEV === "1";

// Lets tests and portable setups use an isolated data folder.
if (process.env.FORMA_USER_DATA) app.setPath("userData", path.resolve(process.env.FORMA_USER_DATA));
const outDir = path.join(__dirname, "..", "out");
const cliIndex = process.argv.indexOf("--cli");
const cli = cliIndex === -1 ? null : process.argv.slice(cliIndex + 1);

if (!app.requestSingleInstanceLock({ cli: cli !== null })) {
  if (cli) process.stderr.write("Forma is already running with this data folder. Close it to use the command line.\n");
  app.exit(cli ? 2 : 0);
}

app.on("second-instance", (_event, _argv, _cwd, data) => {
  if ((data as { cli?: boolean } | undefined)?.cli) return;
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

let dirty = false;
let closeConfirmed = false;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Forma",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });

  win.on("close", (event) => {
    if (!dirty || closeConfirmed) return;
    event.preventDefault();
    win.webContents.send("app:close-requested");
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(isDev ? "http://localhost:3000" : "app://forma/");
}

function registerIpc() {
  const none = z.tuple([]);
  const id = z.tuple([projectId]);
  handle("animations:list", none, listAnimations);
  handle("animations:read", id, readAnimation);
  handle("animations:save", z.tuple([projectId.nullable(), animationClip]), saveAnimation);
  handle("animations:delete", id, deleteAnimation);
  handle("animations:import", none, importAnimation);
  handle("animations:export", id, exportAnimation);
  handle("updates:state", none, updateState);
  handle("updates:check", none, checkForUpdates);
  handle("updates:download", none, downloadUpdate);
  handle("updates:install", none, installUpdate);
  handle("updates:set-enabled", z.tuple([z.boolean()]), setUpdatesEnabled);
  handle("captures:save", z.tuple([z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= 64 * 1024 * 1024), z.string().min(1).max(120)]), saveCapture);
  handle("videos:import", none, importVideo);

  handle("projects:list", none, listProjects);
  handle("projects:create", z.tuple([projectInput]), createProject);
  handle("projects:update", z.tuple([projectId, projectInput]), updateProject);
  handle("projects:open", id, openProject);
  handle("projects:last", none, lastProject);
  handle("projects:rename", z.tuple([projectId, projectName]), renameProject);
  handle("projects:duplicate", z.tuple([projectId, projectName]), duplicateProject);
  handle("projects:delete", id, deleteProject);
  handle("models:import", none, importModel);
  handle("models:read", z.tuple([modelSource]), readModel);
  handle("models:stage-bytes", z.tuple([z.instanceof(Uint8Array), z.string().max(120)]), stageModelBytes);
  handle("models:export", z.tuple([modelSource.nullable(), z.instanceof(Uint8Array).nullable(), z.string().max(120)]), exportModel);
  handle("references:import", none, importReference);
  handle("references:import-bytes", z.tuple([z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= 20 * 1024 * 1024), z.string().min(1).max(120)]), importReferenceBytes);
  handle("references:read", z.tuple([imageSource, projectId.nullable()]), readReference);
  handle("references:stage-bytes", z.tuple([z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= 20 * 1024 * 1024)]), stageReferenceBytes);
  handle("engines:list", none, async () => (await listEngines()).map((e) => e.info));
  handle("plugins:list", none, listPlugins);
  handle("plugins:install", z.tuple([engineId, z.string().max(1024).nullable()]), startInstall);
  handle("plugins:cancel", z.tuple([engineId]), cancelInstall);
  handle("plugins:uninstall", z.tuple([engineId]), uninstallPlugin);
  handle("plugins:choose-python", none, choosePython);
  handle("weights:list", none, listWeights);
  handle("weights:accept-license", z.tuple([engineId]), acceptLicense);
  handle("weights:download", z.tuple([engineId]), downloadWeights);
  handle("weights:cancel", z.tuple([engineId]), cancelDownload);
  handle("weights:verify", z.tuple([engineId]), verifyWeights);
  handle("weights:remove", z.tuple([engineId]), removeWeights);
  handle("weights:check-updates", none, checkUpdates);
  handle("jobs:list", none, () => jobs.list());
  handle("jobs:enqueue", z.tuple([jobRequest]), (request) => jobs.enqueue(request));
  handle("jobs:cancel", z.tuple([z.uuid()]), (id) => jobs.cancel(id));
  handle("jobs:retry", z.tuple([z.uuid()]), (id) => jobs.retry(id));
  handle("jobs:logs", z.tuple([z.uuid()]), (id) => jobs.logs(id));
  handle("jobs:stage-result", z.tuple([z.uuid()]), (id) => jobs.stageResult(id));
  handle("jobs:stage-image", z.tuple([z.uuid()]), (id) => jobs.stageImage(id));
  handle("jobs:stage-reference", z.tuple([z.uuid(), z.string().max(260)]), (id, file) => jobs.stageReference(id, file));
  handle("jobs:stage-file", z.tuple([z.uuid(), z.string().max(260)]), (id, file) => jobs.stageFile(id, file));
  handle("jobs:read-file", z.tuple([z.uuid(), z.string().max(260)]), (id, file) => jobs.readFile(id, file));
  handle("jobs:export-file", z.tuple([z.uuid(), z.string().min(1).max(260)]), (id, file) => jobs.exportFile(id, file));
  handle("jobs:export-package", z.tuple([z.uuid(), z.string().min(1).max(120)]), (id, name) => jobs.exportPackage(id, name));
  handle("system:info", none, getSystemInfo);
  handle("system:hardware", z.tuple([z.boolean()]), getHardware);
  handle("system:motion-providers", none, motionProviders);
  handle("system:blender", z.tuple([z.boolean()]), getBlender);
  handle("system:choose-blender", none, chooseBlender);
  handle("system:open-data-dir", none, openDataDir);
  handle("app:set-dirty", z.tuple([z.boolean()]), (value) => {
    dirty = value;
  });
  handle("app:confirm-close", none, () => {
    closeConfirmed = true;
    BrowserWindow.getAllWindows()[0]?.close();
  });
}

app.whenReady().then(async () => {
  openDb(path.join(app.getPath("userData"), "forma.db"));
  clearStaging();
  if (cli) {
    app.dock?.hide();
    jobs.recover();
    const code = await runCli(cli);
    jobs.shutdown();
    app.exit(code);
    return;
  }
  registerIpc();
  jobs.recover();

  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
    const file = path.normalize(path.join(outDir, rel));
    if (!file.startsWith(outDir + path.sep)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  createWindow();
  checkOnStartup();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => jobs.shutdown());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

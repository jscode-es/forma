import { app, BrowserWindow, net, protocol, shell } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { openDb } from "./db";
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
import { clearStaging, importModel, readModel } from "./models";
import { jobRequest, modelSource, projectId, projectInput, projectName } from "./schemas";
import { getSystemInfo, openDataDir } from "./system";

const isDev = process.env.FORMA_DEV === "1";
const outDir = path.join(__dirname, "..", "out");

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
  handle("engines:list", none, async () => (await listEngines()).map((e) => e.info));
  handle("jobs:list", none, () => jobs.list());
  handle("jobs:enqueue", z.tuple([jobRequest]), (request) => jobs.enqueue(request));
  handle("jobs:cancel", z.tuple([z.uuid()]), (id) => jobs.cancel(id));
  handle("jobs:retry", z.tuple([z.uuid()]), (id) => jobs.retry(id));
  handle("jobs:logs", z.tuple([z.uuid()]), (id) => jobs.logs(id));
  handle("jobs:stage-result", z.tuple([z.uuid()]), (id) => jobs.stageResult(id));
  handle("system:info", none, getSystemInfo);
  handle("system:hardware", z.tuple([z.boolean()]), getHardware);
  handle("system:open-data-dir", none, openDataDir);
  handle("app:set-dirty", z.tuple([z.boolean()]), (value) => {
    dirty = value;
  });
  handle("app:confirm-close", none, () => {
    closeConfirmed = true;
    BrowserWindow.getAllWindows()[0]?.close();
  });
}

app.whenReady().then(() => {
  openDb(path.join(app.getPath("userData"), "forma.db"));
  clearStaging();
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
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => jobs.shutdown());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

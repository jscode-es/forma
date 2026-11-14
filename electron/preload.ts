import { contextBridge, ipcRenderer } from "electron";
import type { FormaApi, IpcChannel, IpcChannels, IpcEvents } from "./contract";

function invoke<K extends IpcChannel>(channel: K, ...args: IpcChannels[K]["args"]): Promise<IpcChannels[K]["result"]> {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe<K extends keyof IpcEvents>(channel: K, callback: (...args: IpcEvents[K]) => void) {
  const listener = (_event: unknown, ...args: unknown[]) => callback(...(args as IpcEvents[K]));
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: FormaApi = {
  projects: {
    list: () => invoke("projects:list"),
    create: (input) => invoke("projects:create", input),
    update: (id, input) => invoke("projects:update", id, input),
    open: (id) => invoke("projects:open", id),
    last: () => invoke("projects:last"),
    rename: (id, name) => invoke("projects:rename", id, name),
    duplicate: (id, name) => invoke("projects:duplicate", id, name),
    delete: (id) => invoke("projects:delete", id),
  },
  models: {
    import: () => invoke("models:import"),
    read: (source) => invoke("models:read", source),
    stageBytes: (bytes, name) => invoke("models:stage-bytes", bytes, name),
    export: (source, bytes, name) => invoke("models:export", source, bytes, name),
  },
  references: {
    import: () => invoke("references:import"),
    read: (source, projectId) => invoke("references:read", source, projectId),
  },
  engines: {
    list: () => invoke("engines:list"),
  },
  weights: {
    list: () => invoke("weights:list"),
    acceptLicense: (id) => invoke("weights:accept-license", id),
    download: (id) => invoke("weights:download", id),
    cancel: (id) => invoke("weights:cancel", id),
    verify: (id) => invoke("weights:verify", id),
    remove: (id) => invoke("weights:remove", id),
    checkUpdates: () => invoke("weights:check-updates"),
    onUpdate: (callback) => subscribe("weights:update", callback),
  },
  jobs: {
    list: () => invoke("jobs:list"),
    enqueue: (request) => invoke("jobs:enqueue", request),
    cancel: (id) => invoke("jobs:cancel", id),
    retry: (id) => invoke("jobs:retry", id),
    logs: (id) => invoke("jobs:logs", id),
    stageResult: (id) => invoke("jobs:stage-result", id),
    stageImage: (id) => invoke("jobs:stage-image", id),
    stageFile: (id, file) => invoke("jobs:stage-file", id, file),
    readFile: (id, file) => invoke("jobs:read-file", id, file),
    onUpdate: (callback) => subscribe("jobs:update", callback),
  },
  system: {
    info: () => invoke("system:info"),
    hardware: (refresh) => invoke("system:hardware", refresh),
    openDataDir: () => invoke("system:open-data-dir"),
  },
  app: {
    setDirty: (dirty) => invoke("app:set-dirty", dirty),
    confirmClose: () => invoke("app:confirm-close"),
    onCloseRequested: (callback) => subscribe("app:close-requested", callback),
  },
};

contextBridge.exposeInMainWorld("forma", api);

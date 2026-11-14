import { contextBridge, ipcRenderer } from "electron";
import type { FormaApi, IpcChannel, IpcChannels } from "./contract";

function invoke<K extends IpcChannel>(channel: K, ...args: IpcChannels[K]["args"]): Promise<IpcChannels[K]["result"]> {
  return ipcRenderer.invoke(channel, ...args);
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
  system: {
    info: () => invoke("system:info"),
    openDataDir: () => invoke("system:open-data-dir"),
  },
  app: {
    setDirty: (dirty) => invoke("app:set-dirty", dirty),
    confirmClose: () => invoke("app:confirm-close"),
    onCloseRequested: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("app:close-requested", listener);
      return () => ipcRenderer.removeListener("app:close-requested", listener);
    },
  },
};

contextBridge.exposeInMainWorld("forma", api);

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("forma", {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (name: string) => ipcRenderer.invoke("projects:create", name),
  },
});

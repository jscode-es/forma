import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { z } from "zod";
import type { IpcChannel, IpcChannels } from "./contract";

type Handler<K extends IpcChannel> = (
  ...args: IpcChannels[K]["args"]
) => IpcChannels[K]["result"] | Promise<IpcChannels[K]["result"]>;

const TRUSTED_ORIGINS = new Set(["app://forma", "http://localhost:3000"]);

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if (!url) throw new Error("Untrusted IPC sender");
  // URL.origin is "null" for custom schemes such as app://, so compare protocol and host.
  const { protocol, host } = new URL(url);
  if (!TRUSTED_ORIGINS.has(`${protocol}//${host}`)) throw new Error("Untrusted IPC sender");
}

export function handle<K extends IpcChannel>(
  channel: K,
  schema: z.ZodType<IpcChannels[K]["args"]>,
  handler: Handler<K>,
) {
  ipcMain.handle(channel, (event, ...raw: unknown[]) => {
    assertTrustedSender(event);
    return handler(...schema.parse(raw));
  });
}

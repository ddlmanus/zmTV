import { WebSocket } from "ws";

/**
 * The workflow backend owns the app-server connection in Electron's main
 * process. Keep the Node transport here instead of relying on the renderer's
 * browser WebSocket global, which is not available in Electron's main bundle.
 */
export function openCodexAppServerSocket(url: string, token: string) {
  return new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

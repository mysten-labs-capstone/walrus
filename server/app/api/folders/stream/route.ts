import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

type FolderSnapshot = {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  updatedAt: Date;
  fileCount: number;
  childCount: number;
};

type FolderChangeType =
  | "create"
  | "delete"
  | "rename"
  | "move"
  | "file_added"
  | "file_removed";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response("Missing userId", {
      status: 400,
      headers: withCORS(req),
    });
  }

  const headers = withCORS(req, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let pollInterval: NodeJS.Timeout | null = null;
      let heartbeatInterval: NodeJS.Timeout | null = null;
      let initialized = false;

      const lastSnapshot = new Map<string, FolderSnapshot>();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollInterval) clearInterval(pollInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err: any) {
          if (err.code === "ERR_INVALID_STATE") {
            cleanup();
          } else {
            console.error("[SSE folders] Failed to send event:", err);
          }
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch (err: any) {
          if (err.code === "ERR_INVALID_STATE") {
            cleanup();
          } else {
            console.error("[SSE folders] Failed to send heartbeat:", err);
          }
        }
      };

      const emitFolderChange = (
        type: FolderChangeType,
        payload: Record<string, unknown>,
      ) => {
        send("folders_changed", { type, ...payload });
      };

      const fetchAndSend = async () => {
        if (closed) return;
        try {
          const folders = await prisma.folder.findMany({
            where: { userId },
            include: {
              _count: {
                select: { files: true, children: true },
              },
            },
          });

          const nextSnapshot = new Map<string, FolderSnapshot>();

          for (const folder of folders) {
            nextSnapshot.set(folder.id, {
              id: folder.id,
              parentId: folder.parentId,
              name: folder.name,
              color: folder.color,
              updatedAt: folder.updatedAt,
              fileCount: folder._count.files,
              childCount: folder._count.children,
            });
          }

          if (!initialized) {
            initialized = true;
            for (const [id, snapshot] of nextSnapshot) {
              lastSnapshot.set(id, snapshot);
            }
            send("ready", { userId });
            return;
          }

          for (const [id, snapshot] of nextSnapshot) {
            const previous = lastSnapshot.get(id);
            if (!previous) {
              emitFolderChange("create", {
                folderId: id,
                parentId: snapshot.parentId,
                name: snapshot.name,
              });
              lastSnapshot.set(id, snapshot);
              continue;
            }

            if (previous.name !== snapshot.name) {
              emitFolderChange("rename", {
                folderId: id,
                name: snapshot.name,
                previousName: previous.name,
              });
            }

            if (previous.parentId !== snapshot.parentId) {
              emitFolderChange("move", {
                folderId: id,
                parentId: snapshot.parentId,
                previousParentId: previous.parentId,
              });
            }

            if (previous.fileCount !== snapshot.fileCount) {
              const delta = snapshot.fileCount - previous.fileCount;
              emitFolderChange(delta > 0 ? "file_added" : "file_removed", {
                folderId: id,
                fileCount: snapshot.fileCount,
                delta,
              });
            }

            lastSnapshot.set(id, snapshot);
          }

          for (const id of Array.from(lastSnapshot.keys())) {
            if (!nextSnapshot.has(id)) {
              emitFolderChange("delete", { folderId: id });
              lastSnapshot.delete(id);
            }
          }
        } catch (err: any) {
          if (!closed) {
            console.error("[SSE folders] Fetch error:", err);
            send("error", {
              message: err?.message || "Failed to fetch folders",
            });
          }
        }
      };

      await fetchAndSend();
      sendHeartbeat();

      pollInterval = setInterval(fetchAndSend, 10000);
      heartbeatInterval = setInterval(sendHeartbeat, 15000);

      const close = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Ignore if already closed.
        }
      };

      req.signal.addEventListener("abort", close);

      const maxLifetime = setTimeout(close, 10 * 60 * 1000);
      req.signal.addEventListener("abort", () => clearTimeout(maxLifetime));
    },
  });

  return new Response(stream, { status: 200, headers });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

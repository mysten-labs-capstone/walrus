import { withCORS } from "../../../_utils/cors";
import prisma from "../../../_utils/prisma";

export const runtime = "nodejs";

type CompletedFile = {
  id: string;
  fileId: string | null;
  blobId: string;
  filename: string;
  epochs: number | null;
  uploadedAt: Date;
};

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

      const lastSnapshot = new Map<string, CompletedFile>();

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
            console.error("[SSE completed] Failed to send event:", err);
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
            console.error("[SSE completed] Failed to send heartbeat:", err);
          }
        }
      };

      const fetchAndSend = async () => {
        if (closed) return;
        try {
          const files = (await prisma.file.findMany({
            where: {
              userId,
              encrypted: true,
              status: "completed",
            },
            select: {
              id: true,
              fileId: true,
              blobId: true,
              filename: true,
              epochs: true,
              uploadedAt: true,
            },
            orderBy: {
              uploadedAt: "desc",
            },
          })) as CompletedFile[];

          if (!initialized) {
            initialized = true;
            for (const file of files) {
              lastSnapshot.set(file.id, file);
            }
            send("snapshot", { files });
            return;
          }

          const currentIds = new Set(files.map((file) => file.id));

          for (const file of files) {
            if (!lastSnapshot.has(file.id)) {
              lastSnapshot.set(file.id, file);
              send("completed", file);
            } else {
              lastSnapshot.set(file.id, file);
            }
          }

          for (const id of Array.from(lastSnapshot.keys())) {
            if (!currentIds.has(id)) {
              lastSnapshot.delete(id);
            }
          }
        } catch (err: any) {
          if (!closed) {
            console.error("[SSE completed] Fetch error:", err);
            send("error", {
              message: err?.message || "Failed to fetch completed files",
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

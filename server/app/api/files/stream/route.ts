import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

function parseIds(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const ids = parseIds(url.searchParams.get("ids"));

  if (!userId || ids.length === 0) {
    return new Response("Missing userId or ids", {
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

      const lastSnapshot = new Map<
        string,
        { status?: string | null; blobId?: string | null }
      >();

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
          // Controller closed - cleanup and prevent further attempts
          if (err.code === "ERR_INVALID_STATE") {
            cleanup();
          } else {
            console.error("[SSE] Failed to send event:", err);
          }
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch (err: any) {
          // Controller closed - cleanup and prevent further attempts
          if (err.code === "ERR_INVALID_STATE") {
            cleanup();
          } else {
            console.error("[SSE] Failed to send heartbeat:", err);
          }
        }
      };

      const fetchAndSend = async () => {
        if (closed) return;
        try {
          const files = await prisma.file.findMany({
            where: {
              blobId: { in: ids },
              userId,
            },
            select: {
              blobId: true,
              status: true,
            },
          });

          for (const file of files) {
            if (closed) break;
            const prev = lastSnapshot.get(file.blobId);
            if (prev?.status !== file.status || prev?.blobId !== file.blobId) {
              lastSnapshot.set(file.blobId, {
                status: file.status,
                blobId: file.blobId,
              });
              send("status", {
                id: file.blobId,
                status: file.status,
                blobId: file.blobId,
              });
            }
          }
        } catch (err: any) {
          if (!closed) {
            console.error("[SSE] Fetch error:", err);
            send("error", {
              message: err?.message || "Failed to fetch status",
            });
          }
        }
      };

      // Initial payload
      await fetchAndSend();
      sendHeartbeat();

      // Poll every 8 seconds (reduced from 5s to save server resources)
      pollInterval = setInterval(fetchAndSend, 8000);
      // Heartbeat every 15 seconds to keep connection alive
      heartbeatInterval = setInterval(sendHeartbeat, 15000);

      const close = () => {
        cleanup();
        try {
          controller.close();
        } catch (err) {
          // Silently ignore - controller may already be closed
        }
      };

      req.signal.addEventListener("abort", close);

      // Auto-cleanup after 10 minutes of inactivity to prevent orphaned connections
      const maxLifetime = setTimeout(close, 10 * 60 * 1000);
      req.signal.addEventListener("abort", () => clearTimeout(maxLifetime));
    },
  });

  return new Response(stream, { status: 200, headers });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

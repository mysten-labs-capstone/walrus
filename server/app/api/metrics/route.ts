import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";

type Metric = {
  kind: string;
  filename?: string;
  durationMs?: number;
  bytes?: number;
  ts: number;
  error?: string;
  success?: boolean;
};

const METRICS: Metric[] = [];

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  const sorted = [...METRICS].sort((a, b) => b.ts - a.ts).slice(0, 50);
  return NextResponse.json(sorted, { headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const metric = (await req.json()) as Metric;
    METRICS.push(metric);
    return NextResponse.json({ ok: true }, { headers: withCORS(req) });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to record metric" },
      { status: 400, headers: withCORS(req) }
    );
  }
}

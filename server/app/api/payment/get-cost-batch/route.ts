import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { calculateCost, fetchPrices } from "@/utils/paymentCost";
import { paymentQuoteStore } from "@/utils/paymentQuoteStore";

export const runtime = "nodejs";
const MAX_EPOCHS = 53;

type BatchFileInput = {
  tempId?: string;
  size: number;
  epochs?: number;
  encrypted?: boolean;
  contentType?: string;
};

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, files } = body as {
      userId?: string;
      files?: BatchFileInput[];
    };

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "Missing files" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const prices = await fetchPrices();

    const perFile = [] as Array<{
      tempId: string;
      costUSD: number;
      costSUI: number;
      sizeInMB: string;
      storageDays: number;
      epochs: number;
    }>;

    for (const file of files) {
      if (!file?.size || file.size <= 0) {
        return NextResponse.json(
          { error: "Invalid file size" },
          { status: 400, headers: withCORS(req) },
        );
      }

      const tempId = file.tempId ?? "";
      if (!tempId) {
        return NextResponse.json(
          { error: "Missing tempId" },
          { status: 400, headers: withCORS(req) },
        );
      }

      const cost = await calculateCost({
        fileSize: file.size,
        epochs: file.epochs,
        prices,
      });

      if (cost.epochs > MAX_EPOCHS) {
        return NextResponse.json(
          { error: `Maximum storage duration is ${MAX_EPOCHS} epochs` },
          { status: 400, headers: withCORS(req) },
        );
      }

      perFile.push({
        tempId,
        costUSD: cost.costUSD,
        costSUI: cost.costSUI,
        sizeInMB: cost.sizeInMB,
        storageDays: cost.storageDays,
        epochs: cost.epochs,
      });
    }

    const totalCostUSD = perFile.reduce((sum, file) => sum + file.costUSD, 0);
    const totalCostSUI = perFile.reduce((sum, file) => sum + file.costSUI, 0);

    const quote = paymentQuoteStore.createQuote({
      userId,
      perFile,
      totalCostUSD,
      totalCostSUI,
    });

    return NextResponse.json(
      {
        totalCost: Number(totalCostUSD.toFixed(4)),
        totalCostUSD: Number(totalCostUSD.toFixed(4)),
        totalCostSUI: Number(totalCostSUI.toFixed(8)),
        perFile,
        quoteId: quote.quoteId,
        expiresAt: quote.expiresAt,
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("Batch cost calculation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to calculate batch cost" },
      { status: 500, headers: withCORS(req) },
    );
  }
}

import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import { suiToUSD, fromSmallestUnit } from "@/utils/priceConverter";

// Used Emojis: 💬 ❗

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  try {
    const { suiClient, signer, network } = await initWalrus();
    const address = signer.toSuiAddress();

    console.log(`💬 Fetching balances for ${address} on ${network}...`);

    // get all coin balances
    const allBalances = await suiClient.getAllBalances({
      owner: address,
    });

    // extract sui balance
    const suiBalance = allBalances.find((coin) =>
      coin.coinType.includes("0x2::sui::SUI")
    );

    // extract wal balance
    const walBalance = allBalances.find((coin) =>
      coin.coinType.toLowerCase().includes("wal")
    );

    // convert to formatted amounts
    const suiAmount = suiBalance
      ? (Number(suiBalance.totalBalance) / 1_000_000_000).toFixed(4)
      : "0.0000";
    
    const walAmount = walBalance
      ? (Number(walBalance.totalBalance) / 1_000_000_000).toFixed(4)
      : "0.0000";
    
    // convert to USD
    const suiUSD = await suiToUSD(Number(suiAmount));
    const walUSD = await suiToUSD(Number(walAmount)); // WAL has a 1:1 conversion with SUI

    console.log(`💬 SUI AVAILABLE --> USD: ${suiUSD}, SUI: ${suiAmount} SUI (${suiBalance?.totalBalance || "0"} MIST)`);
    console.log(`💬 WAL AVAILABLE --> USD: ${walUSD}, WAL: ${walAmount} WAL (${walBalance?.totalBalance || "0"} smallest unit)`);

    return NextResponse.json(
      {
        address,
        network,
        balances: {
          sui: {
            raw: suiBalance?.totalBalance || "0",
            formatted: suiAmount,
            symbol: "SUI",
          },
          wal: {
            raw: walBalance?.totalBalance || "0",
            formatted: walAmount,
            symbol: "WAL",
            coinType: walBalance?.coinType || "Not found",
          },
        },
        allCoins: allBalances.map((coin) => ({
          coinType: coin.coinType,
          balance: coin.totalBalance,
          formatted: (Number(coin.totalBalance) / 1_000_000_000).toFixed(4),
        })),
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err) {
    console.error("❗ Balance error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500, headers: withCORS(req) }
    );
  }
}
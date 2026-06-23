import { NextRequest, NextResponse } from "next/server";
import { claimNextMarketplaceLink, requireExtensionAuth } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireExtensionAuth(request.headers);
    const clientId = request.nextUrl.searchParams.get("clientId");
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    const link = await claimNextMarketplaceLink(clientId);
    return NextResponse.json(link ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to claim next link";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

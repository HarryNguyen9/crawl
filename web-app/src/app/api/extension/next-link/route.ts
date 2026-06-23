import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { claimNextMarketplaceLink, peekNextMarketplaceLink, requireExtensionAuth } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireExtensionAuth(request.headers);
    const clientId = request.nextUrl.searchParams.get("clientId");
    if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    const platformParam = request.nextUrl.searchParams.get("platform");
    const platform = platformParam === Platform.lazada || platformParam === Platform.shopee ? platformParam : undefined;
    const peek = request.nextUrl.searchParams.get("peek") === "true";
    const link = peek ? await peekNextMarketplaceLink(clientId, platform) : await claimNextMarketplaceLink(clientId, platform);
    return NextResponse.json(link ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to claim next link";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

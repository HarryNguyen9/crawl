import { NextRequest, NextResponse } from "next/server";
import { requireExtensionAuth, touchExtensionClient } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireExtensionAuth(request.headers);
    const body = await request.json().catch(() => ({}));
    if (typeof body.clientId !== "string" || !body.clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }
    const client = touchExtensionClient(body.clientId, typeof body.currentLink === "string" ? body.currentLink : undefined);
    return NextResponse.json({ ok: true, client });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update extension heartbeat";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { registerExtensionClient, requireExtensionAuth } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireExtensionAuth(request.headers);
    const body = await request.json().catch(() => ({}));
    const client = registerExtensionClient(typeof body.clientId === "string" ? body.clientId : undefined);
    return NextResponse.json({ clientId: client.clientId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register extension";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

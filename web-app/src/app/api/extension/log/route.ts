import { NextRequest, NextResponse } from "next/server";
import { requireExtensionAuth, saveExtensionLog } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireExtensionAuth(request.headers);
    await saveExtensionLog(await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save extension log";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

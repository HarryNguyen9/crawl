import { NextRequest, NextResponse } from "next/server";
import { requireExtensionAuth, saveExtensionResult } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireExtensionAuth(request.headers);
    const result = await saveExtensionResult(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save extension result";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

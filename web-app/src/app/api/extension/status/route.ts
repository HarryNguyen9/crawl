import { NextResponse } from "next/server";
import { getExtensionStatus } from "@/lib/extensionBridge";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getExtensionStatus());
}

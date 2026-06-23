import { NextResponse } from "next/server";
import { getDbStatus } from "@/lib/dbStatus";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDbStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read DB status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

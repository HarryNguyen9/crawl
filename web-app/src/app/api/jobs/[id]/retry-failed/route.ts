import { NextResponse } from "next/server";
import { retryFailedLinks } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await retryFailedLinks(params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retry failed links";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

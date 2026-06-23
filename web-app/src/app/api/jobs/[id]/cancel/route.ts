import { NextResponse } from "next/server";
import { cancelJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const job = await cancelJob(params.id);
    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
}

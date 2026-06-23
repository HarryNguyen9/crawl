import { NextResponse } from "next/server";
import { getJobProgress } from "@/lib/jobs";
import { isJobRunning } from "@/lib/jobRunner";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await getJobProgress(params.id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: { ...job, isRunningInProcess: isJobRunning(params.id) } });
}

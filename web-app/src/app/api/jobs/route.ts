import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { createCrawlJob, listJobs } from "@/lib/jobs";
import { createJobSchema, jobHistoryQuerySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = createJobSchema.parse(await request.json());
    const job = await createCrawlJob(body.platform, body.links);
    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;
    const query = jobHistoryQuerySchema.parse({
      platform: search.get("platform") ? (search.get("platform") as Platform) : undefined
    });
    const jobs = await listJobs(query.platform);
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load jobs";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

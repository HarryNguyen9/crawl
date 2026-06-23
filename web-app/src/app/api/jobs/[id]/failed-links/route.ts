import { NextRequest, NextResponse } from "next/server";
import { CrawlLinkStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const links = await prisma.crawlLink.findMany({
    where: {
      jobId: params.id,
      status: CrawlLinkStatus.failed
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      error: true,
      retryCount: true,
      finishedAt: true
    }
  });

  return NextResponse.json({ links });
}

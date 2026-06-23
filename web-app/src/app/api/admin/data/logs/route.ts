import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const logs = await prisma.crawlLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return NextResponse.json({ logs });
}

export async function DELETE() {
  const result = await prisma.crawlLog.deleteMany();
  return NextResponse.json({ deleted: result.count });
}

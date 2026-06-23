import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const result = await prisma.productSku.updateMany({
    where: { rawJson: { not: null } },
    data: { rawJson: null }
  });
  return NextResponse.json({ updated: result.count });
}

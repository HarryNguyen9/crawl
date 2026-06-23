import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteAllSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  const body = deleteAllSchema.safeParse(await request.json().catch(() => ({})));
  const expected = process.env.ADMIN_DELETE_CONFIRM_TEXT || "DELETE";

  if (!body.success || body.data.confirmText !== expected) {
    return NextResponse.json({ error: `Type ${expected} to confirm` }, { status: 400 });
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const logs = await tx.crawlLog.deleteMany();
    const skus = await tx.productSku.deleteMany();
    const links = await tx.crawlLink.deleteMany();
    const jobs = await tx.crawlJob.deleteMany();
    return {
      logs: logs.count,
      skus: skus.count,
      links: links.count,
      jobs: jobs.count
    };
  });

  return NextResponse.json({ deleted });
}

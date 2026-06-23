import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paginationSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const query = paginationSchema.parse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined
  });
  const skip = (query.page - 1) * query.pageSize;
  const [results, total] = await Promise.all([
    prisma.productSku.findMany({
      where: { jobId: params.id },
      orderBy: { createdAt: "asc" },
      skip,
      take: query.pageSize
    }),
    prisma.productSku.count({ where: { jobId: params.id } })
  ]);

  return NextResponse.json({
    results,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    }
  });
}

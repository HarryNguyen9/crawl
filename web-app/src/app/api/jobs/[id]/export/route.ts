import { NextResponse } from "next/server";
import { buildJobWorkbook } from "@/lib/exportExcel";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const workbook = await buildJobWorkbook(params.id);
  if (!workbook) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(workbook.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${workbook.filename}"`
    }
  });
}

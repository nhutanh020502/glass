import { getDashboard } from "../../../db/store";

export async function GET() {
  try {
    return Response.json(await getDashboard(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể tải dữ liệu." },
      { status: 500 },
    );
  }
}

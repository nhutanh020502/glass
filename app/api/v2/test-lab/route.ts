import { getTestLabDashboard } from "../../../../db/v2";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getTestLabDashboard(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể tải khu vực test." }, { status: 500 });
  }
}

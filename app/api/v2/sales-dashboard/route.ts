import { getSalesDashboard } from "../../../../db/v2";
import { getUserFromRequest } from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Yêu cầu đăng nhập." }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    return Response.json(await getSalesDashboard({
      fromDate: params.get("fromDate") || "",
      toDate: params.get("toDate") || "",
      sources: params.getAll("source"),
      glasses: params.get("glasses") || "",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể tải dashboard bán hàng." }, { status: 400 });
  }
}

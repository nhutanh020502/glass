import { getV2Dashboard } from "../../../../db/v2";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await getV2Dashboard({
      scope: params.get("scope") || "overview",
      customer: params.get("customer") || "",
      product: params.get("product") || "",
      sources: params.getAll("source"),
      inventoryProduct: params.get("inventoryProduct") || "",
      inventorySources: params.getAll("inventorySource"),
      inventoryFromDate: params.get("inventoryFromDate") || "",
      inventoryToDate: params.get("inventoryToDate") || "",
      fromDate: params.get("fromDate") || "",
      toDate: params.get("toDate") || "",
      status: params.get("status") || "",
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể tải dữ liệu." }, { status: 500 });
  }
}

import { importHistoricalOrders, type HistoricalOrderInput } from "../../../db/store";

export async function POST(request: Request) {
  try {
    if (request.headers.get("x-import-source") !== "excel-2026") {
      return Response.json({ error: "Nguồn nhập không hợp lệ." }, { status: 400 });
    }
    const payload = (await request.json()) as { orders?: HistoricalOrderInput[] };
    return Response.json(await importHistoricalOrders(payload.orders ?? []), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể nhập dữ liệu Excel." },
      { status: 400 },
    );
  }
}

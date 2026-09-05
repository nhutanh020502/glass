import { createOrder, searchOrders, type CreateOrderInput } from "../../../db/store";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await searchOrders({
      customer: params.get("customer") ?? "",
      product: params.get("product") ?? "",
      fromDate: params.get("fromDate") ?? "",
      toDate: params.get("toDate") ?? "",
      status: (params.get("status") ?? "") as "PROCESS" | "DONE" | "",
      page: Number(params.get("page") || 1),
      pageSize: 50,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể tìm đơn hàng." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as CreateOrderInput;
    return Response.json(await createOrder(input), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể tạo đơn hàng." },
      { status: 400 },
    );
  }
}

import { completeOrder } from "../../../../../db/store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return Response.json(await completeOrder(id));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể hoàn tất đơn hàng." },
      { status: 400 },
    );
  }
}

import { updateOrder, type UpdateOrderInput } from "../../../../db/store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = (await request.json()) as UpdateOrderInput;
    return Response.json(await updateOrder(id, input));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật đơn hàng." },
      { status: 400 },
    );
  }
}

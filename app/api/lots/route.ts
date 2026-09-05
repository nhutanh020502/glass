import { createLot, type CreateLotInput } from "../../../db/store";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as CreateLotInput;
    return Response.json(await createLot(input), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không thể nhập lô hàng." },
      { status: 400 },
    );
  }
}

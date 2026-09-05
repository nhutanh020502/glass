import { runV2Action } from "../../../../db/v2";

function actor(request: Request) {
  return request.headers.get("oai-authenticated-user-email") || "Chủ tài khoản";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; input?: Record<string, unknown> };
    return Response.json(await runV2Action(String(body.action || ""), body.input || {}, actor(request)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể thực hiện thao tác." }, { status: 400 });
  }
}

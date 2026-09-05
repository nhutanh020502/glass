import { runV2Action } from "../../../../db/v2";
import { getUserFromRequest } from "../../../../db/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Yêu cầu đăng nhập để thực hiện thao tác." }, { status: 401 });
    }

    const body = await request.json() as { action?: string; input?: Record<string, unknown> };
    return Response.json(await runV2Action(String(body.action || ""), body.input || {}, user.email));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể thực hiện thao tác." }, { status: 400 });
  }
}

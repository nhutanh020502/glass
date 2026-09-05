import { getUserFromRequest } from '../../../../db/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return Response.json({ user: null }, { status: 200 });
    }
    return Response.json({ user }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ user: null }, { status: 200 });
  }
}

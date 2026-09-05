import { isRegistrationAllowed } from '../../../../db/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const allowRegistration = await isRegistrationAllowed();
    return Response.json({ allowRegistration }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ allowRegistration: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

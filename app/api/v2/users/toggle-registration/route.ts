import { getUserFromRequest, setRegistrationAllowed } from '../../../../../db/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const caller = await getUserFromRequest(request);
    if (!caller) {
      return Response.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401 });
    }

    if (caller.role !== 'ADMIN') {
      return Response.json({ error: 'Chỉ Admin mới có quyền thay đổi cài đặt này.' }, { status: 403 });
    }

    const body = (await request.json()) as { allowed?: boolean };
    const allowed = Boolean(body.allowed);
    await setRegistrationAllowed(allowed);

    // Broadcast realtime event to Supabase Realtime REST API if URL & key are available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wowjlldnblegwbdoqtrf.supabase.co';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && serviceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/app_settings?key=eq.allow_registration`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            value: allowed ? 'true' : 'false',
            updated_at: new Date().toISOString(),
          }),
        });
      } catch {
        // Fallback: Postgres update already committed
      }
    }

    return Response.json({ success: true, allowRegistration: allowed });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không thể cập nhật cấu hình đăng ký.' },
      { status: 400 }
    );
  }
}

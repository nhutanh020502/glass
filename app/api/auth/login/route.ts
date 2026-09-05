import { loginUser } from '../../../../db/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string; rememberMe?: boolean };
    const rememberMe = Boolean(body.rememberMe);
    const { user, token } = await loginUser(body.email || '', body.password || '', rememberMe);

    // Set cookie: If rememberMe is true, 30 days max-age; if false, session cookie (cleared on browser close)
    const isProduction = process.env.NODE_ENV === 'production';
    let cookieValue = `ord_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
    if (rememberMe) {
      cookieValue += `; Max-Age=${30 * 24 * 60 * 60}`;
    }

    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieValue,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Đăng nhập không thành công.' },
      { status: 400 }
    );
  }
}

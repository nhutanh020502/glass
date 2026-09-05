import { registerUser } from '../../../../db/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const { user, token } = await registerUser(body.email || '', body.password || '');

    // Set cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieValue = `ord_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${isProduction ? '; Secure' : ''}`;

    return new Response(JSON.stringify({ success: true, user }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieValue,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không thể đăng ký tài khoản.' },
      { status: 400 }
    );
  }
}

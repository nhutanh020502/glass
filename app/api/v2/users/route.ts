import { getUserFromRequest, getAllUsers, updateUserRole, UserRole } from '../../../../db/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return Response.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401 });
    }

    const users = await getAllUsers();
    return Response.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không thể lấy danh sách người dùng.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const caller = await getUserFromRequest(request);
    if (!caller) {
      return Response.json({ error: 'Yêu cầu đăng nhập.' }, { status: 401 });
    }

    if (caller.role !== 'ADMIN') {
      return Response.json({ error: 'Chỉ Admin mới có quyền thay đổi vai trò tài khoản.' }, { status: 403 });
    }

    const body = (await request.json()) as { targetUserId?: string; role?: UserRole };
    if (!body.targetUserId || !body.role) {
      return Response.json({ error: 'Thiếu thông tin người dùng hoặc vai trò.' }, { status: 400 });
    }

    const updatedUser = await updateUserRole(caller.id, body.targetUserId, body.role);
    return Response.json({ success: true, user: updatedUser });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không thể cập nhật vai trò người dùng.' },
      { status: 400 }
    );
  }
}

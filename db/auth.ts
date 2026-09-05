import crypto from 'node:crypto';
import { getPg } from './supabase';

const AUTH_SECRET = process.env.AUTH_SECRET || 'ord-studio-auth-secret-2026-secure-jwt-key';

export type UserRole = 'ADMIN' | 'USER';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  exp: number;
}

let authSchemaReady = false;

/**
 * Ensures app_users and app_settings tables exist in PostgreSQL
 */
export async function ensureAuthSchema(): Promise<void> {
  if (authSchemaReady) return;
  const sql = getPg();

  await sql`
    CREATE TABLE IF NOT EXISTS "app_users" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT NOT NULL UNIQUE,
      "password_hash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'USER',
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "idx_app_users_email" ON "app_users" ("email");
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "app_settings" (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );
  `;

  // Default setting: allow registration if not explicitly set
  await sql`
    INSERT INTO "app_settings" ("key", "value", "updated_at")
    VALUES ('allow_registration', 'true', ${new Date().toISOString()})
    ON CONFLICT ("key") DO NOTHING;
  `;

  // Enable supabase realtime publication for app_settings so client gets immediate updates
  try {
    await sql.unsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'app_settings'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
          END IF;
        END IF;
      END $$;
    `);
  } catch {
    // Ignore if permission denied on publication
  }

  authSchemaReady = true;
}

/**
 * Military-grade scrypt password hashing
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Cryptographic HMAC SHA-256 Session Token
 */
export function createSessionToken(user: { id: string; email: string; role: UserRole }, rememberMe: boolean): string {
  // 30 days if rememberMe, 24 hours otherwise
  const expiresInSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user from Request Cookie or Authorization Header
 */
export async function getUserFromRequest(request: Request): Promise<AppUser | null> {
  await ensureAuthSchema();
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/ord_session=([^;]+)/);
  let token = match ? decodeURIComponent(match[1]) : null;

  if (!token) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const sql = getPg();
  const rows = await sql<AppUser[]>`
    SELECT id, email, role, created_at, updated_at
    FROM "app_users"
    WHERE id = ${payload.userId} AND status = 'ACTIVE'
    LIMIT 1
  `;

  return rows[0] || null;
}

/**
 * Get registration allowed status
 */
export async function isRegistrationAllowed(): Promise<boolean> {
  await ensureAuthSchema();
  const sql = getPg();
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM "app_settings" WHERE key = 'allow_registration' LIMIT 1
  `;
  if (!rows.length) return true;
  return rows[0].value === 'true';
}

/**
 * Set registration allowed status (Admin only)
 */
export async function setRegistrationAllowed(allowed: boolean): Promise<boolean> {
  await ensureAuthSchema();
  const sql = getPg();
  const value = allowed ? 'true' : 'false';
  const now = new Date().toISOString();

  await sql`
    INSERT INTO "app_settings" ("key", "value", "updated_at")
    VALUES ('allow_registration', ${value}, ${now})
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = EXCLUDED."updated_at"
  `;

  return allowed;
}

/**
 * Register a new user
 * - First user becomes ADMIN automatically
 * - Subsequent users become USER (if allow_registration is true)
 */
export async function registerUser(emailRaw: string, passwordRaw: string): Promise<{ user: AppUser; token: string }> {
  await ensureAuthSchema();
  const sql = getPg();

  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) {
    throw new Error('Vui lòng nhập định dạng email hợp lệ.');
  }

  const password = passwordRaw.trim();
  if (password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.');
  }

  // Check if this is the first user
  const countResult = await sql<{ count: string }[]>`
    SELECT COUNT(*) AS count FROM "app_users"
  `;
  const totalUsers = parseInt(countResult[0]?.count || '0', 10);

  const role: UserRole = totalUsers === 0 ? 'ADMIN' : 'USER';

  if (role === 'USER') {
    const allowed = await isRegistrationAllowed();
    if (!allowed) {
      throw new Error('Hệ thống đang tạm khóa đăng ký tài khoản mới. Vui lòng liên hệ Admin.');
    }
  }

  // Check existing
  const existing = await sql`
    SELECT id FROM "app_users" WHERE email = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    throw new Error('Email này đã được đăng ký trên hệ thống.');
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();

  await sql`
    INSERT INTO "app_users" ("id", "email", "password_hash", "role", "status", "created_at", "updated_at")
    VALUES (${id}, ${email}, ${passwordHash}, ${role}, 'ACTIVE', ${now}, ${now})
  `;

  const user: AppUser = {
    id,
    email,
    role,
    created_at: now,
    updated_at: now,
  };

  const token = createSessionToken(user, true);
  return { user, token };
}

/**
 * Log in an existing user
 */
export async function loginUser(emailRaw: string, passwordRaw: string, rememberMe: boolean): Promise<{ user: AppUser; token: string }> {
  await ensureAuthSchema();
  const sql = getPg();

  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw.trim();

  if (!email || !password) {
    throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
  }

  const rows = await sql<{ id: string; email: string; password_hash: string; role: UserRole; status: string; created_at: string; updated_at: string }[]>`
    SELECT id, email, password_hash, role, status, created_at, updated_at
    FROM "app_users"
    WHERE email = ${email}
    LIMIT 1
  `;

  const record = rows[0];
  if (!record || record.status !== 'ACTIVE') {
    throw new Error('Email hoặc mật khẩu không chính xác.');
  }

  const valid = verifyPassword(password, record.password_hash);
  if (!valid) {
    throw new Error('Email hoặc mật khẩu không chính xác.');
  }

  const user: AppUser = {
    id: record.id,
    email: record.email,
    role: record.role,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };

  const token = createSessionToken(user, rememberMe);
  return { user, token };
}

/**
 * Get all users for admin management
 */
export async function getAllUsers(): Promise<AppUser[]> {
  await ensureAuthSchema();
  const sql = getPg();

  return await sql<AppUser[]>`
    SELECT id, email, role, created_at, updated_at
    FROM "app_users"
    ORDER BY created_at ASC
  `;
}

/**
 * Change a user's role (Admin only)
 * Explicitly forbids deleting users per user requirement!
 */
export async function updateUserRole(adminUserId: string, targetUserId: string, newRole: UserRole): Promise<AppUser> {
  await ensureAuthSchema();
  const sql = getPg();

  // Verify caller is ADMIN
  const caller = await sql<{ role: string }[]>`
    SELECT role FROM "app_users" WHERE id = ${adminUserId} AND status = 'ACTIVE' LIMIT 1
  `;
  if (!caller.length || caller[0].role !== 'ADMIN') {
    throw new Error('Chỉ Admin mới có quyền thay đổi vai trò tài khoản.');
  }

  if (newRole !== 'ADMIN' && newRole !== 'USER') {
    throw new Error('Vai trò không hợp lệ.');
  }

  // Check target user
  const target = await sql<AppUser[]>`
    SELECT id, email, role, created_at, updated_at FROM "app_users" WHERE id = ${targetUserId} LIMIT 1
  `;
  if (!target.length) {
    throw new Error('Không tìm thấy tài khoản người dùng.');
  }

  // Ensure there remains at least 1 Admin
  if (target[0].role === 'ADMIN' && newRole === 'USER') {
    const adminCountResult = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM "app_users" WHERE role = 'ADMIN' AND status = 'ACTIVE'
    `;
    const adminCount = parseInt(adminCountResult[0]?.count || '0', 10);
    if (adminCount <= 1) {
      throw new Error('Hệ thống phải có ít nhất 1 tài khoản Admin. Không thể hạ quyền Admin cuối cùng.');
    }
  }

  const now = new Date().toISOString();
  await sql`
    UPDATE "app_users"
    SET role = ${newRole}, updated_at = ${now}
    WHERE id = ${targetUserId}
  `;

  return {
    ...target[0],
    role: newRole,
    updated_at: now,
  };
}

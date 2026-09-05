"use client";

import { useCallback, useEffect, useState } from "react";
import { LoggedUser } from "./auth-view";

interface UsersTabProps {
  currentUser: LoggedUser;
}

interface UserItem {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
  created_at: string;
  updated_at: string;
}

export default function UsersTab({ currentUser }: UsersTabProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const isAdmin = currentUser.role === "ADMIN";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, settingsRes] = await Promise.all([
        fetch("/api/v2/users"),
        fetch("/api/auth/settings"),
      ]);

      if (usersRes.ok) {
        const data = (await usersRes.json()) as { users: UserItem[] };
        setUsers(data.users || []);
      }

      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as { allowRegistration: boolean };
        if (typeof data.allowRegistration === "boolean") {
          setAllowRegistration(data.allowRegistration);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải danh sách tài khoản.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  async function toggleRegistration() {
    if (!isAdmin) return;
    setToggling(true);
    setError("");
    setNotice("");
    try {
      const nextAllowed = !allowRegistration;
      const res = await fetch("/api/v2/users/toggle-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed: nextAllowed }),
      });

      const data = (await res.json()) as { success?: boolean; allowRegistration?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Không thể thay đổi cài đặt.");

      setAllowRegistration(Boolean(data.allowRegistration));
      setNotice(
        data.allowRegistration
          ? "Đã MỞ đăng ký tài khoản mới bên ngoài màn hình đăng nhập (Đồng bộ Realtime)."
          : "Đã KHÓA đăng ký tài khoản mới. Nút đăng ký ở mọi máy khác đã lập tức biến mất (Đồng bộ Realtime)."
      );
      setTimeout(() => setNotice(""), 5000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Đã có lỗi xảy ra.");
    } finally {
      setToggling(false);
    }
  }

  async function handleRoleChange(targetUser: UserItem, newRole: "ADMIN" | "USER") {
    if (!isAdmin) return;
    const actionText = newRole === "ADMIN" ? "chuyển quyền Admin cho" : "hạ quyền Admin của";
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản ${targetUser.email}?`)) {
      return;
    }

    setUpdatingId(targetUser.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/v2/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetUser.id, role: newRole }),
      });

      const data = (await res.json()) as { success?: boolean; user?: UserItem; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error || "Không thể cập nhật vai trò.");

      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      );
      setNotice(`Đã cập nhật vai trò tài khoản ${targetUser.email} thành ${newRole}.`);
      setTimeout(() => setNotice(""), 4000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Đã có lỗi xảy ra.");
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(str?: string) {
    if (!str) return "—";
    try {
      return new Intl.DateTimeFormat("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(str));
    } catch {
      return str;
    }
  }

  return (
    <section className="panel orders-panel page-panel users-panel">
      {/* Header Controls */}
      <div className="users-header-card">
        <div>
          <span className="eyebrow">HỆ THỐNG & TÀI KHOẢN</span>
          <h2>Quản lý Người Dùng & Phân Quyền</h2>
          <p>
            Phân định rõ ràng vai trò <strong>ADMIN</strong> (Quản trị toàn quyền) và <strong>USER</strong> (Nhân viên vận hành).
          </p>
        </div>

        {isAdmin && (
          <div className="registration-toggle-box">
            <div className="toggle-info">
              <strong>Đăng ký tài khoản mới</strong>
              <span className={`status-pill ${allowRegistration ? "open" : "closed"}`}>
                {allowRegistration ? "● Đang Mở Đăng Ký" : "● Đã Khóa Đăng Ký"}
              </span>
            </div>
            <button
              type="button"
              className={`toggle-btn ${allowRegistration ? "active" : ""}`}
              onClick={toggleRegistration}
              disabled={toggling}
              title="Nhấn để Bật/Tắt nút đăng ký theo thời gian thực"
            >
              {toggling ? "Đang xử lý..." : allowRegistration ? "Tắt Đăng Ký Ngoài Màn Hình" : "Bật Đăng Ký Ngoài Màn Hình"}
            </button>
          </div>
        )}
      </div>

      {/* Security Rule Notice */}
      <div className="security-rule-notice">
        <span className="shield-icon">🛡️</span>
        <div>
          <strong>Chính sách Bảo toàn Dữ liệu Kiểm toán (Không xóa User)</strong>
          <p>
            Hệ thống không cho phép xóa tài khoản để đảm bảo tính toàn vẹn và minh bạch của lịch sử nhập kho, xuất bán và các giao dịch tài chính.
          </p>
        </div>
      </div>

      {notice && <div className="notice success-notice">{notice}</div>}
      {error && <div className="notice error-notice">{error}</div>}

      {/* Users Table */}
      <div className="table-wrap users-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tài khoản / Email</th>
              <th>Vai trò</th>
              <th>Ngày tạo</th>
              <th>Trạng thái</th>
              <th style={{ textAlign: "right" }}>Thao tác Admin</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "30px" }}>
                  Đang tải danh sách người dùng...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "30px" }}>
                  Chưa có người dùng nào.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUser.id;
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="user-email-cell">
                        <strong>{user.email}</strong>
                        {isSelf && <span className="self-badge">Bạn</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${user.role.toLowerCase()}`}>
                        {user.role === "ADMIN" ? "★ Quản trị viên (ADMIN)" : "Nhân viên (USER)"}
                      </span>
                    </td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <span className="status-badge-active">Hoạt động</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isAdmin ? (
                        user.role === "USER" ? (
                          <button
                            type="button"
                            className="button secondary sm-btn"
                            disabled={updatingId === user.id}
                            onClick={() => handleRoleChange(user, "ADMIN")}
                          >
                            {updatingId === user.id ? "Đang xử lý..." : "Chuyển thành ADMIN"}
                          </button>
                        ) : (
                          !isSelf && (
                            <button
                              type="button"
                              className="button secondary sm-btn demote-btn"
                              disabled={updatingId === user.id}
                              onClick={() => handleRoleChange(user, "USER")}
                            >
                              {updatingId === user.id ? "Đang xử lý..." : "Hạ thành USER"}
                            </button>
                          )
                        )
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "12px" }}>Chỉ xem</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .users-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .users-header-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 24px 28px;
          background: linear-gradient(135deg, #162540 0%, #1f355c 100%);
          border-radius: 16px;
          color: white;
          box-shadow: 0 10px 30px rgba(20, 33, 58, 0.1);
        }
        .users-header-card h2 {
          margin: 6px 0 4px;
          font-size: 22px;
          letter-spacing: -0.02em;
        }
        .users-header-card p {
          margin: 0;
          color: #b0c0d8;
          font-size: 13px;
        }
        .registration-toggle-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 18px;
          background: rgba(10, 18, 32, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          min-width: 250px;
        }
        .toggle-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }
        .status-pill {
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
        }
        .status-pill.open {
          background: rgba(69, 198, 154, 0.2);
          color: #45c69a;
        }
        .status-pill.closed {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
        .toggle-btn {
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: #22375a;
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toggle-btn.active {
          background: #d9a441;
          color: #111d33;
          border-color: #f5c866;
        }
        .toggle-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        .security-rule-notice {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          background: #edf3fc;
          border-left: 4px solid #3b82f6;
          border-radius: 10px;
          color: #1e3a8a;
          font-size: 12px;
          line-height: 1.5;
        }
        .shield-icon {
          font-size: 20px;
        }
        .security-rule-notice strong {
          display: block;
          font-size: 13px;
          color: #1e40af;
        }
        .security-rule-notice p {
          margin: 2px 0 0;
          color: #3b5998;
        }
        .user-email-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .self-badge {
          padding: 2px 6px;
          border-radius: 4px;
          background: #e0e7ff;
          color: #3730a3;
          font-size: 10px;
          font-weight: 700;
        }
        .role-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 750;
        }
        .role-badge.admin {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .role-badge.user {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }
        .status-badge-active {
          color: #15803d;
          font-weight: 600;
          font-size: 12px;
        }
        .sm-btn {
          padding: 6px 12px;
          font-size: 11px;
          border-radius: 7px;
        }
        .demote-btn {
          color: #b91c1c;
        }
      `}</style>
    </section>
  );
}

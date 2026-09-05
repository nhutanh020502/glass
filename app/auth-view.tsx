"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export interface LoggedUser {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
  created_at?: string;
}

interface AuthViewProps {
  onSuccess: (user: LoggedUser) => void;
}

export default function AuthView({ onSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Realtime subscription to app_settings
  useEffect(() => {
    // 1. Initial fetch
    fetch("/api/auth/settings")
      .then((res) => res.json() as Promise<{ allowRegistration?: boolean }>)
      .then((data) => {
        if (typeof data.allowRegistration === "boolean") {
          setAllowRegistration(data.allowRegistration);
        }
      })
      .catch(() => {});

    // 2. Realtime listener with Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wowjlldnblegwbdoqtrf.supabase.co";
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvd2psbGRuYmxlZ3diZG9xdHJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDIwMzUsImV4cCI6MjEwNDExODAzNX0.KFYwsYIaXoyYdcxipEiY0rmwNTtp13DQX3WXUWhIRNc";

    let cleanupClient: (() => void) | null = null;
    try {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const channel = client
        .channel("realtime:auth_settings")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_settings" },
          (payload: { new?: { key?: string; value?: string } }) => {
            if (payload.new && payload.new.key === "allow_registration") {
              const isAllowed = payload.new.value === "true";
              setAllowRegistration(isAllowed);
              if (!isAllowed && modeRef.current === "register") {
                setMode("login");
                setNotice("Admin vừa khóa đăng ký tài khoản mới theo thời gian thực.");
              }
            }
          }
        )
        .subscribe();

      cleanupClient = () => {
        client.removeChannel(channel);
      };
    } catch {
      // Ignore client init error
    }

    // 3. Fallback polling every 3 seconds for instant synchronization
    const pollInterval = setInterval(() => {
      fetch("/api/auth/settings")
        .then((res) => res.json() as Promise<{ allowRegistration?: boolean }>)
        .then((data) => {
          if (typeof data.allowRegistration === "boolean") {
            const nextVal = data.allowRegistration;
            setAllowRegistration((prev) => {
              if (prev !== nextVal) {
                if (!nextVal && modeRef.current === "register") {
                  setMode("login");
                  setNotice("Admin vừa khóa đăng ký tài khoản mới theo thời gian thực.");
                }
                return nextVal;
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      if (cleanupClient) cleanupClient();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!email || !email.includes("@")) {
      setError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Mật khẩu xác nhận không khớp.");
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email, password, rememberMe }
          : { email, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as { success?: boolean; user?: LoggedUser; error?: string };

      if (!response.ok || !result.user) {
        throw new Error(result.error || "Không thể thực hiện yêu cầu.");
      }

      onSuccess(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Đã có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-brand">
          <div className="auth-brand-mark">OR</div>
          <div>
            <h2>ORD Studio</h2>
            <p>Hệ Thống Quản Lý Đơn Hàng & Kho Vận</p>
          </div>
        </div>

        {/* Realtime Status Banner */}
        <div className="auth-realtime-badge">
          <span className="auth-dot" />
          <span>Bảo mật cấp độ cao · Đồng bộ thời gian thực</span>
        </div>

        {/* Mode Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Đăng nhập
          </button>
          {allowRegistration ? (
            <button
              type="button"
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Đăng ký tài khoản
            </button>
          ) : (
            <span className="auth-tab-disabled" title="Admin đang tạm khóa đăng ký mới">
              Đăng ký (Đang khóa)
            </span>
          )}
        </div>

        {/* Alerts */}
        {error && <div className="auth-alert error">{error}</div>}
        {notice && <div className="auth-alert notice">{notice}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="auth-email">Địa chỉ Email</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="ten@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-header">
              <label htmlFor="auth-password">Mật khẩu</label>
              <button
                type="button"
                className="auth-show-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </div>
            <input
              id="auth-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label htmlFor="auth-confirm-password">Xác nhận mật khẩu</label>
              <input
                id="auth-confirm-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <p className="auth-help-text">
                * Tài khoản đăng ký đầu tiên sẽ được chỉ định làm <strong>ADMIN</strong> hệ thống.
              </p>
            </div>
          )}

          {mode === "login" && (
            <div className="auth-options">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                />
                <span>Ghi nhớ tài khoản trên thiết bị này (30 ngày)</span>
              </label>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? (
              <span className="auth-spinner" />
            ) : mode === "login" ? (
              "Đăng nhập ngay →"
            ) : (
              "Tạo tài khoản mới →"
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            ORD Studio · Bảo mật đa lớp qua PostgreSQL Pooler & JWT Token
          </p>
        </div>
      </div>

      <style jsx>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: radial-gradient(circle at 50% 20%, #152238 0%, #0c1424 100%);
          font-family: inherit;
        }
        .auth-card {
          width: 100%;
          max-width: 440px;
          background: rgba(17, 29, 51, 0.88);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 36px 32px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
          color: #e2e8f0;
        }
        .auth-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }
        .auth-brand-mark {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border: 2px solid #f5c866;
          border-radius: 12px;
          color: #f5c866;
          font-weight: 800;
          font-size: 16px;
        }
        .auth-brand h2 {
          margin: 0;
          font-size: 20px;
          color: #ffffff;
          letter-spacing: -0.02em;
        }
        .auth-brand p {
          margin: 3px 0 0;
          font-size: 12px;
          color: #8c9cb5;
        }
        .auth-realtime-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(69, 198, 154, 0.1);
          border: 1px solid rgba(69, 198, 154, 0.25);
          border-radius: 10px;
          font-size: 11px;
          color: #45c69a;
          margin-bottom: 22px;
        }
        .auth-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #45c69a;
          box-shadow: 0 0 8px #45c69a;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        .auth-tabs {
          display: flex;
          gap: 6px;
          padding: 4px;
          background: rgba(13, 22, 38, 0.7);
          border-radius: 12px;
          margin-bottom: 22px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .auth-tab {
          flex: 1;
          padding: 10px 14px;
          border: 0;
          background: transparent;
          color: #8c9cb5;
          font-size: 13px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .auth-tab:hover {
          color: #ffffff;
        }
        .auth-tab.active {
          background: #1d2b45;
          color: #f5c866;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .auth-tab-disabled {
          flex: 1;
          padding: 10px 14px;
          text-align: center;
          font-size: 12px;
          color: #5a6679;
          cursor: not-allowed;
          font-style: italic;
        }
        .auth-alert {
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 12px;
          margin-bottom: 18px;
          line-height: 1.4;
        }
        .auth-alert.error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
        }
        .auth-alert.notice {
          background: rgba(245, 200, 102, 0.12);
          border: 1px solid rgba(245, 200, 102, 0.3);
          color: #fcd34d;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .auth-field-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .auth-field label {
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .auth-show-btn {
          border: 0;
          background: transparent;
          color: #f5c866;
          font-size: 11px;
          cursor: pointer;
          padding: 0;
        }
        .auth-field input {
          width: 100%;
          height: 42px;
          padding: 0 14px;
          background: rgba(13, 22, 38, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #ffffff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .auth-field input:focus {
          border-color: #f5c866;
          box-shadow: 0 0 0 3px rgba(245, 200, 102, 0.15);
        }
        .auth-field input::placeholder {
          color: #55657d;
        }
        .auth-help-text {
          margin: 4px 0 0;
          font-size: 11px;
          color: #94a3b8;
        }
        .auth-options {
          display: flex;
          align-items: center;
          font-size: 12px;
        }
        .auth-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: #94a3b8;
          user-select: none;
        }
        .auth-checkbox input {
          width: 16px;
          height: 16px;
          accent-color: #d9a441;
          cursor: pointer;
        }
        .auth-submit-btn {
          margin-top: 8px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f5c866 0%, #d9a441 100%);
          color: #111d33;
          border: 0;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 14px rgba(217, 164, 65, 0.3);
        }
        .auth-submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(217, 164, 65, 0.4);
        }
        .auth-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .auth-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(17, 29, 51, 0.3);
          border-top-color: #111d33;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .auth-footer {
          margin-top: 24px;
          text-align: center;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 16px;
        }
        .auth-footer p {
          margin: 0;
          font-size: 11px;
          color: #64748b;
        }
      `}</style>
    </div>
  );
}

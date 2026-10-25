import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { ADMIN_PATH } from "@/constants";
import { useAdminSessionMutation } from "@/features/admin/hooks/useAdminSystem";
import { useStore } from "@/store/useStore";
import AuthLayout from "@/features/auth/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "@/lib/api";

/**
 * Superadmin console login.
 *
 * The same `AuthLayout` as the public login, with the operator voice: no role picker,
 * no registration path, a security note, and the brand panel's copy about running the
 * platform rather than learning in it. The route sits outside `AdminLayout`, so the
 * page owns the whole viewport.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const setToken = useStore((state) => state.setToken);
  const sessionMutation = useAdminSessionMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // An operator who is already signed in belongs in the console, not on its login form.
  useEffect(() => {
    if (user && (user.role === "admin" || user.role === "superadmin")) {
      navigate(ADMIN_PATH, { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const session = await sessionMutation.mutateAsync({ username, password });
      if (session.token) setToken(session.token);
      setUser(session.user);
      navigate(ADMIN_PATH);
    } catch (requestError) {
      // Wrong credentials are not an expired session; show the server's own sentence.
      setError(apiErrorMessage(requestError, "登录失败，请重试"));
    }
  };

  return (
    <div data-role="admin">
      <AuthLayout variant="admin" title="管理后台" subtitle="使用超级管理员账号登录 Think-Class">
        <form onSubmit={handleLogin} className="space-y-5">
          {error ? (
            <div role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-body-sm font-medium text-danger">
              {error}
            </div>
          ) : null}

          <FormField label="管理员账号">
            <Input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11 text-body"
              placeholder="输入超级管理员账号"
            />
          </FormField>

          <FormField label="密码">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 pr-11 text-body"
                placeholder="••••••••"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </FormField>

          <Button type="submit" size="lg" disabled={sessionMutation.isPending} className="w-full">
            {sessionMutation.isPending ? (
              <>
                <Spinner label="正在验证" className="text-role-contrast" />
                验证中…
              </>
            ) : (
              "进入控制台"
            )}
          </Button>

          <p className="text-center text-caption text-fg-3">
            仅限授权管理员访问；登录与敏感操作会记录在审计日志。
          </p>
        </form>
      </AuthLayout>
    </div>
  );
}

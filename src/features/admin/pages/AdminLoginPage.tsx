import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { ADMIN_PATH } from "@/constants";
import { useAdminSessionMutation } from "@/features/admin/hooks/useAdminSystem";
import { useStore } from "@/store/useStore";
import LoginBackground from "@/features/auth/components/LoginBackground";
import LoginCard from "@/features/auth/components/LoginCard";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageScaffold } from "@/components/ui/page-scaffold";
import { Spinner } from "@/components/ui/spinner";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const responseMessage = (error as any)?.response?.data?.message;
    const dataMessage = (error as any)?.data?.message;
    if (responseMessage) return responseMessage;
    if (dataMessage) return dataMessage;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "网络或服务器错误";
}

/**
 * Superadmin console login.
 *
 * Lives in the admin feature but is a login surface, so it moved onto the same kit as
 * the public one: `Input` + `FormField` + `Button` + `Spinner` instead of two
 * hand-styled `<input>` elements and a `motion.button` painted with emerald
 * utilities. The admin accent comes from `data-role="admin"`, which is why the
 * submit button no longer names a colour.
 *
 * The placeholders and the button's accessible name are unchanged on purpose:
 * `src/pages/Admin/Login.test.tsx` drives this page by both.
 *
 * It is one of the admin console's pages, so its shape comes from
 * `PageScaffold variant="form"`; it passes no `title`, because the card below already
 * carries its own heading and a scaffold heading would print it twice on a standalone
 * render. The route sits outside `AdminLayout` (a login cannot require a session), so
 * in production the scaffold renders no heading at all.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const setUser = useStore((state) => state.setUser);
  const setToken = useStore((state) => state.setToken);
  const sessionMutation = useAdminSessionMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const session = await sessionMutation.mutateAsync({ username, password });
      if (session.token) setToken(session.token);
      setUser(session.user);
      navigate(ADMIN_PATH);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <div
      data-role="admin"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface-1 px-4 font-sans text-fg-1"
    >
      <LoginBackground />

      {/*
        A console page, so its shape is the scaffold's. `data-role="admin"` stays on the
        element that also paints the page, because `PageScaffold` forwards no arbitrary
        attributes and the admin accent is the whole reason this login looks like the
        admin console rather than the student one.
      */}
      <PageScaffold variant="form" className="relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mx-auto w-full max-w-md"
        >
          <div className="absolute -top-14 left-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/")}
              className="border-line-1 bg-surface-2/85 text-fg-3 backdrop-blur-sm"
            >
              <ArrowLeft data-icon="inline-start" /> 返回官网
            </Button>
          </div>

          <LoginCard>
            <div className="mb-8 text-center">
              <motion.div
                whileHover={{ rotate: 12 }}
                transition={{ duration: 0.3 }}
                className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-card bg-role-soft text-role-ink shadow-inset"
              >
                <ShieldCheck className="h-8 w-8" />
              </motion.div>
              <h2 className="text-2xl font-bold tracking-tight text-fg-1">
                Think-Class 管理后台
              </h2>
              <p className="mt-2 text-sm font-medium text-fg-3">Admin Dashboard</p>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 rounded-panel bg-danger-soft p-4 text-sm font-medium text-danger"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleLogin} className="space-y-5">
              <FormField label="管理员账号">
                <Input
                  type="text"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-12 bg-surface-2 text-base"
                  placeholder="输入超级管理员账号"
                />
              </FormField>

              <FormField label="密码">
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 bg-surface-2 text-base"
                  placeholder="••••••••"
                />
              </FormField>

              <Button
                type="submit"
                size="lg"
                disabled={sessionMutation.isPending}
                className="mt-2 h-12 w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                {sessionMutation.isPending ? (
                  <>
                    <Spinner label="正在验证" className="text-role-contrast" />
                    验证中...
                  </>
                ) : (
                  "进入控制台"
                )}
              </Button>
            </form>
          </LoginCard>
        </motion.div>
      </PageScaffold>
    </div>
  );
}

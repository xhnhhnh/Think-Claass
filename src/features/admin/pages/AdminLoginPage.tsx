import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { ADMIN_PATH } from "@/constants";
import { useAdminSessionMutation } from "@/features/admin/hooks/useAdminSystem";
import { useStore } from "@/store/useStore";
import LoginBackground from "@/features/auth/components/LoginBackground";
import LoginCard from "@/features/auth/components/LoginCard";

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

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const setUser = useStore((state) => state.setUser);
  const sessionMutation = useAdminSessionMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const session = await sessionMutation.mutateAsync({ username, password });
      setUser(session.user);
      navigate(ADMIN_PATH);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <div className="public-campus-page relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--campus-canvas)] px-4 font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-700">
      <LoginBackground />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Back button */}
        <div className="absolute -top-14 left-0">
          <button
            onClick={() => navigate("/")}
            className="flex items-center rounded-lg border border-[var(--campus-border)] bg-white/85 px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-emerald-700"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> 返回官网
          </button>
        </div>

        <LoginCard>
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              whileHover={{ rotate: 12 }}
              transition={{ duration: 0.3 }}
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shadow-inner"
            >
              <ShieldCheck className="h-8 w-8" />
            </motion.div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Think-Class 管理后台
            </h2>
            <p className="mt-2 text-sm text-slate-500 font-medium">
              Admin Dashboard
            </p>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 text-sm font-medium rounded-xl"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                管理员账号
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-lg border border-[var(--campus-border)] bg-white px-4 py-3 text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                placeholder="输入超级管理员账号"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                密码
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-[var(--campus-border)] bg-white px-4 py-3 text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                placeholder="••••••••"
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={sessionMutation.isPending}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sessionMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  验证中...
                </>
              ) : (
                "进入控制台"
              )}
            </motion.button>
          </form>
        </LoginCard>
      </motion.div>
    </div>
  );
}

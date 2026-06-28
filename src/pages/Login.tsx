import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { User, Lock, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { authApi } from "@/features/auth/api/authApi";
import LoginBackground from "@/features/auth/components/LoginBackground";
import LoginCard from "@/features/auth/components/LoginCard";
import LoginInput from "@/features/auth/components/LoginInput";
import LoginSubmitButton from "@/features/auth/components/LoginSubmitButton";
import RoleSelector from "@/features/auth/components/RoleSelector";
import { type RoleType, ROLE_THEME } from "@/features/auth/components/loginStyles";
import WebsiteIcon from "@/components/WebsiteIcon";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<RoleType>("student");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [password, setPassword] = useState("");
  const [students, setStudents] = useState<{ id: number; name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [fetchingStudents, setFetchingStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const setUser = useStore((state) => state.setUser);

  const theme = ROLE_THEME[role];

  const handleInviteCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase();
    setInviteCode(code);

    if (code.length === 6) {
      setFetchingStudents(true);
      try {
        const data = (await authApi.verifyInviteCode(code, role)) as any;
        if (data.success) {
          setStudents(data.students);
          if (data.students.length > 0) {
            setSelectedStudentId(data.students[0].id);
          } else {
            setSelectedStudentId(null);
          }
          setError("");
        } else {
          setStudents([]);
          setSelectedStudentId(null);
          setError(data.message);
        }
      } catch (err) {
        setError("获取班级学生列表失败");
      } finally {
        setFetchingStudents(false);
      }
    } else {
      setStudents([]);
      setSelectedStudentId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = isLogin
        ? { username, password, role }
        : {
            username,
            password,
            role,
            name: students.find((s) => s.id === selectedStudentId)?.name || "",
            invite_code: inviteCode,
            student_id: selectedStudentId,
          };

      const data = isLogin
        ? ((await authApi.login(payload)) as any)
        : ((await authApi.register(payload)) as any);

      if (data.success) {
        if (isLogin) {
          setUser({
            ...data.user,
            classFeatures: data.classFeatures ?? undefined,
          });
          if (data.user.role === "teacher") {
            navigate("/teacher");
          } else if (data.user.role === "parent") {
            navigate("/parent/dashboard");
          } else {
            navigate("/student/pet");
          }
        } else {
          setIsLogin(true);
          setError(
            role === "student" || role === "parent"
              ? "绑定成功，请使用新账号登录"
              : "注册成功，请登录"
          );
        }
      } else {
        setError(data.message || "An error occurred");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const isCodesRole = role === "student" || role === "parent";

  return (
    <div className="public-campus-page min-h-screen bg-[var(--campus-canvas)] text-slate-800 selection:bg-emerald-100 selection:text-emerald-700 font-sans overflow-hidden relative flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <LoginBackground />

      {/* ---- Header ---- */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        {/* Back button */}
        <div className="absolute left-0 top-0 sm:left-auto sm:right-full sm:mr-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center rounded-lg border border-[var(--campus-border)] bg-white/85 px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-emerald-700"
          >
            &larr; 返回官网
          </button>
        </div>

        {/* Logo */}
        <WebsiteIcon className="mx-auto h-16 w-16 rounded-lg object-cover mt-8" />

        <h2 className="mt-6 text-center text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
          Think-Class
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500">
          {isLogin
            ? "登录你的账号"
            : isCodesRole
              ? "使用邀请码激活绑定账号"
              : "注册新账号"}
        </p>
      </motion.div>

      {/* ---- Card ---- */}
      <LoginCard>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <RoleSelector value={role} onChange={(r) => { setRole(r); setIsLogin(true); }} />

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-4 text-sm rounded-xl ${
                  error.includes("成功")
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                账号
              </label>
              <LoginInput
                icon={User}
                role={role}
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入账号"
              />
            </div>

            {/* Invite code section (register only, student/parent) */}
            {isCodesRole && !isLogin && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="relative pt-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-white text-slate-400 font-medium">
                        班级邀请码绑定
                      </span>
                    </div>
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                      班级邀请码
                    </label>
                    <LoginInput
                      icon={Lock}
                      role={role}
                      type="text"
                      required
                      maxLength={6}
                      value={inviteCode}
                      onChange={handleInviteCodeChange}
                      placeholder="输入6位班级邀请码"
                      className="uppercase"
                    />
                  </div>

                  {fetchingStudents ? (
                    <div className="text-sm text-slate-500 flex items-center justify-center py-2">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-500" />
                      正在寻找小伙伴...
                    </div>
                  ) : inviteCode.length === 6 && students.length === 0 ? (
                    <div className="p-4 text-sm rounded-xl bg-red-50 border border-red-200 text-center text-red-800">
                      未找到班级或所有小伙伴都已绑定啦
                    </div>
                  ) : inviteCode.length === 6 && students.length > 0 ? (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                        我是谁
                      </label>
                      <select
                        required
                        value={selectedStudentId || ""}
                        onChange={(e) => setSelectedStudentId(Number(e.target.value))}
                        className={`block w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:outline-none transition-all text-slate-800 ${theme.ring}`}
                      >
                        <option value="" disabled>
                          {role === "parent" ? "请选择您的孩子" : "请选择你的名字"}
                        </option>
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-slate-400 ml-1">
                        {role === "parent"
                          ? "选择您要绑定的孩子名字"
                          : "选择老师为你预先添加的名字进行账号绑定"}
                      </p>
                    </motion.div>
                  ) : null}
                </motion.div>
              </>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                密码
              </label>
              <LoginInput
                icon={Lock}
                role={role}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={role === "student" && isLogin ? "默认密码: 123456" : "输入密码"}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4">
            <LoginSubmitButton loading={loading} role={role}>
              {isLogin
                ? "开启旅程"
                : isCodesRole
                  ? "绑定并激活"
                  : "注册新账号"}
            </LoginSubmitButton>
          </div>
        </form>

        {/* Toggle login / register */}
        <div className="mt-8">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-slate-400 font-medium">
                {isLogin ? (isCodesRole ? "首次使用？" : "还没有账号？") : "已有账号？"}
              </span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className={`font-semibold transition-colors ${theme.text} ${theme.textHover}`}
            >
              {isLogin
                ? (isCodesRole ? "使用邀请码激活绑定" : "注册新账号")
                : "返回登录"}
            </button>
          </div>

          {role === "student" && isLogin && (
            <div className="text-center text-xs text-slate-400 mt-4">
              学生账号由老师统一创建并发放，无需自主注册。
            </div>
          )}
        </div>
      </LoginCard>
    </div>
  );
}

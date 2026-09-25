import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { User, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { authApi } from "@/features/auth/api/authApi";
import LoginBackground from "@/features/auth/components/LoginBackground";
import LoginCard from "@/features/auth/components/LoginCard";
import LoginInput from "@/features/auth/components/LoginInput";
import LoginSubmitButton from "@/features/auth/components/LoginSubmitButton";
import RoleSelector, { ROLE_SCOPE_ATTR, type RoleType } from "@/features/auth/components/RoleSelector";
import WebsiteIcon from "@/components/WebsiteIcon";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Public login / registration / invite-code binding.
 *
 * The role accent is a **token scope**, not a JavaScript colour map. Choosing a role
 * sets `data-role` on the page wrapper, which is the same mechanism the four shells
 * use (`RoleTheme` puts it on `<html>`), so `bg-role` and `text-role-ink` inside the
 * form follow the choice without a single component knowing what a role is - while
 * `bg-brand` and the status colours stay the product's.
 *
 * What that replaced: `loginStyles.ts`, which held eleven hex colours, a second copy
 * of the three role palettes, and a `ROLE_THEME` map that four components read from -
 * plus inline `style` props on the role buttons and the submit button to apply it.
 * The page also used to be repainted wholesale by the `.public-campus-page` block in
 * `index.css`; P3 deleted that block, because the page now says what it means.
 *
 * Public site, so it wears no console page scaffold: `/login` is a flat route with no
 * console shell above it and the page keeps its own centred composition. Everything below
 * is the UI-R vocabulary now - `bg-surface-*`, `text-fg-*`, `border-line-*`, `text-role`,
 * the status `-soft`/`-ink` pairs - instead of the `bg-paper` / `text-ink-*` / `primary`
 * aliases.
 */
export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<RoleType>("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [students, setStudents] = useState<{ id: number; name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [fetchingStudents, setFetchingStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const setUser = useStore((state) => state.setUser);
  const setToken = useStore((state) => state.setToken);

  const isCodesRole = role === "student" || role === "parent";
  const isSuccessMessage = error.includes("成功");

  const handleInviteCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase();
    setInviteCode(code);

    if (code.length === 6) {
      setFetchingStudents(true);
      try {
        const data = (await authApi.verifyInviteCode(code, role)) as any;
        if (data.success) {
          setStudents(data.students);
          setSelectedStudentId(data.students.length > 0 ? data.students[0].id : null);
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
          // The server issues a session token alongside the user payload; storing it
          // is what moves this session off the header-assertion bridge.
          if (data.token) setToken(data.token);
          setUser({
            ...data.user,
            classFeatures: data.classFeatures ?? undefined,
          });
          if (data.user.role === "teacher") {
            navigate("/teacher");
          } else if (data.user.role === "parent") {
            navigate("/parent/dashboard");
          } else {
            navigate("/student");
          }
        } else {
          setIsLogin(true);
          setError(
            isCodesRole ? "绑定成功，请使用新账号登录" : "注册成功，请登录"
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

  return (
    <div
      {...ROLE_SCOPE_ATTR[role]}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-surface-1 py-12 font-sans text-fg-1 sm:px-6 lg:px-8"
    >
      <LoginBackground />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="absolute left-0 top-0 sm:left-auto sm:right-full sm:mr-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/")}
            className="border-line-1 bg-surface-2/85 text-fg-3 backdrop-blur-sm hover:text-role"
          >
            &larr; 返回官网
          </Button>
        </div>

        <WebsiteIcon className="mx-auto mt-8 h-16 w-16 rounded-card object-cover" />

        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-fg-1 md:text-3xl">
          Think-Class
        </h2>
        <p className="mt-2 text-center text-sm text-fg-3">
          {isLogin ? "登录你的账号" : isCodesRole ? "使用邀请码激活绑定账号" : "注册新账号"}
        </p>
      </motion.div>

      <LoginCard>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <RoleSelector
            value={role}
            onChange={(r) => {
              setRole(r);
              setIsLogin(true);
            }}
          />

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "rounded-panel p-4 text-sm",
                  isSuccessMessage
                    ? "bg-success-soft text-success-ink"
                    : "bg-danger-soft text-danger",
                )}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            <FormField label="账号">
              <LoginInput
                icon={User}
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入账号"
              />
            </FormField>

            {isCodesRole && !isLogin && (
              <>
                <Divider label="班级邀请码绑定" />

                <FormField label="班级邀请码">
                  <LoginInput
                    icon={Lock}
                    type="text"
                    required
                    maxLength={6}
                    value={inviteCode}
                    onChange={handleInviteCodeChange}
                    placeholder="输入6位班级邀请码"
                    className="uppercase"
                  />
                </FormField>

                {fetchingStudents ? (
                  <div className="flex items-center justify-center py-2 text-sm text-fg-3">
                    <Spinner size="sm" label="正在寻找小伙伴" className="mr-2" />
                    正在寻找小伙伴...
                  </div>
                ) : inviteCode.length === 6 && students.length === 0 ? (
                  <div className="rounded-panel bg-danger-soft p-4 text-center text-sm text-danger">
                    未找到班级或所有小伙伴都已绑定啦
                  </div>
                ) : inviteCode.length === 6 && students.length > 0 ? (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                    <FormField
                      label="我是谁"
                      hint={role === "parent" ? "选择您要绑定的孩子名字" : "选择老师为你预先添加的名字进行账号绑定"}
                    >
                      <Select
                        required
                        value={selectedStudentId || ""}
                        onChange={(e) => setSelectedStudentId(Number(e.target.value))}
                      >
                        <option value="" disabled>
                          {role === "parent" ? "请选择您的孩子" : "请选择你的名字"}
                        </option>
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </motion.div>
                ) : null}
              </>
            )}

            <FormField label="密码">
              <LoginInput
                icon={Lock}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
              />
            </FormField>
          </div>

          <div className="pt-4">
            <LoginSubmitButton loading={loading}>
              {isLogin ? "开启旅程" : isCodesRole ? "绑定并激活" : "注册新账号"}
            </LoginSubmitButton>
          </div>
        </form>

        <div className="mt-8">
          <Divider label={isLogin ? (isCodesRole ? "首次使用？" : "还没有账号？") : "已有账号？"} />

          <div className="mt-6 text-center">
            <Button
              type="button"
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="h-auto font-semibold text-role hover:text-role/80"
            >
              {isLogin ? (isCodesRole ? "使用邀请码激活绑定" : "注册新账号") : "返回登录"}
            </Button>
          </div>

          {role === "student" && isLogin && (
            <div className="mt-4 text-center text-xs text-fg-3">
              学生账号由老师统一创建并发放，无需自主注册。
            </div>
          )}
        </div>
      </LoginCard>
    </div>
  );
}

/** The "or" rule between the form and the footer link. */
function Divider({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-line-1" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-surface-2 px-4 font-medium text-fg-3">{label}</span>
      </div>
    </div>
  );
}

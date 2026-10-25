import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { Eye, EyeOff, Lock, User } from "lucide-react";

import { authApi } from "@/features/auth/api/authApi";
import AuthLayout from "@/features/auth/components/AuthLayout";
import LoginInput from "@/features/auth/components/LoginInput";
import RoleSelector, { ROLE_SCOPE_ATTR, type RoleType } from "@/features/auth/components/RoleSelector";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "@/lib/api";
import { homePathForRole } from "@/app/routing/homePath";
import { cn } from "@/lib/utils";

/**
 * Public login / registration / invite-code binding.
 *
 * The role accent is a **token scope**, not a JavaScript colour map: choosing a role sets
 * `data-role` on the page wrapper, the same mechanism the four shells use. The public
 * login shares `AuthLayout` with the admin login, so the brand promise, the form rhythm
 * and the mobile collapse cannot drift between the two doors into the product.
 *
 * The previous version was a card floating in a field of paper, with the product name
 * centred above it and no statement of what the product is for. `AuthLayout` supplies
 * the brand panel on desktop; the form column here owns only the task.
 */
export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<RoleType>("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [students, setStudents] = useState<{ id: number; name: string }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [fetchingStudents, setFetchingStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const setToken = useStore((state) => state.setToken);
  /**
   * Which invite-code lookup is the current one.
   *
   * The lookup fires on every six-character value; a slow answer for an old code used to land
   * after a newer one and attach the previous class's roster to the form. A sequence number makes
   * "the answer the reader is waiting for" explicit.
   */
  const inviteLookupSeq = useRef(0);

  const isCodesRole = role === "student" || role === "parent";
  const isSuccessMessage = error.includes("成功");

  // Already signed in: this page is not a place to retype credentials.
  useEffect(() => {
    if (user) navigate(homePathForRole(user.role), { replace: true });
  }, [user, navigate]);

  const handleInviteCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.toUpperCase();
    const requestId = ++inviteLookupSeq.current;
    setInviteCode(code);

    if (code.length === 6) {
      setFetchingStudents(true);
      try {
        const data = (await authApi.verifyInviteCode(code, role)) as any;
        if (requestId !== inviteLookupSeq.current) return;
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
        if (requestId !== inviteLookupSeq.current) return;
        setStudents([]);
        setSelectedStudentId(null);
        setError(apiErrorMessage(err, "获取班级学生列表失败"));
      } finally {
        if (requestId === inviteLookupSeq.current) setFetchingStudents(false);
      }
    } else {
      setStudents([]);
      setSelectedStudentId(null);
      setFetchingStudents(false);
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
          if (data.token) setToken(data.token);
          setUser({
            ...data.user,
            classFeatures: data.classFeatures ?? undefined,
          });
          navigate(homePathForRole(data.user.role));
        } else {
          setIsLogin(true);
          setError(isCodesRole ? "绑定成功，请使用新账号登录" : "注册成功，请登录");
        }
      } else {
        setError(data.message || "登录失败，请重试");
      }
    } catch (err) {
      // The server's sentence is the only one worth showing: `src/lib/api.ts` classifies a 401
      // from the sign-in endpoint as wrong credentials, not as an expired session.
      setError(apiErrorMessage(err, "登录失败，请重试"));
    } finally {
      setLoading(false);
    }
  };

  const title = isLogin ? "欢迎回来" : isCodesRole ? "激活并绑定账号" : "创建账号";
  const subtitle = isLogin
    ? "选择身份，登录你的 Think-Class 账号"
    : isCodesRole
      ? "输入老师发放的邀请码，绑定你或孩子的账号"
      : "注册一个账号，开始使用 Think-Class";

  return (
    <div {...ROLE_SCOPE_ATTR[role]}>
      <AuthLayout variant="public" title={title} subtitle={subtitle}>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <RoleSelector
            value={role}
            onChange={(r) => {
              setRole(r);
              setIsLogin(true);
              // A different identity changes which codes are valid and which roster can be shown;
              // carrying the previous role's error or student list into the new form is how the
              // wrong child got attached to an account.
              setError("");
              setInviteCode("");
              setStudents([]);
              setSelectedStudentId(null);
              setFetchingStudents(false);
              inviteLookupSeq.current += 1;
            }}
          />

          {error ? (
            <div
              role="alert"
              className={cn(
                "rounded-lg px-3.5 py-3 text-body-sm font-medium",
                isSuccessMessage ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger",
              )}
            >
              {error}
            </div>
          ) : null}

          <FormField label="账号">
            <LoginInput
              icon={User}
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入账号"
            />
          </FormField>

          {isCodesRole && !isLogin ? (
            <>
              <Divider label="班级邀请码" />

              <FormField label="邀请码">
                <LoginInput
                  icon={Lock}
                  type="text"
                  required
                  maxLength={6}
                  value={inviteCode}
                  onChange={handleInviteCodeChange}
                  placeholder="输入 6 位班级邀请码"
                  className="uppercase tracking-widest"
                />
              </FormField>

              {fetchingStudents ? (
                <div className="flex items-center justify-center gap-2 py-1 text-body-sm text-fg-3">
                  <Spinner size="sm" label="正在查询班级" />
                  正在查询班级…
                </div>
              ) : inviteCode.length === 6 && students.length === 0 ? (
                <div className="rounded-lg bg-danger-soft px-3.5 py-3 text-body-sm text-danger">
                  未找到班级，或班里的小伙伴都已绑定。
                </div>
              ) : inviteCode.length === 6 && students.length > 0 ? (
                <FormField
                  label="绑定到"
                  hint={role === "parent" ? "选择您要绑定的孩子" : "选择老师预先添加的名字"}
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
              ) : null}
            </>
          ) : null}

          <FormField label="密码">
            <LoginInput
              icon={Lock}
              type={showPassword ? "text" : "password"}
              required
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              trailing={
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
              }
            />
          </FormField>

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full bg-brand text-brand-contrast hover:bg-brand-strong"
          >
            {loading ? <Spinner label="正在登录" className="text-role-contrast" /> : null}
            {loading
              ? "正在登录…"
              : isLogin
                ? "登录"
                : isCodesRole
                  ? "绑定并激活"
                  : "注册账号"}
          </Button>
        </form>

        <div className="mt-6 space-y-3">
          <Divider label={isLogin ? "首次使用？" : "已有账号？"} />
          <div className="text-center">
            <Button
              type="button"
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="h-auto font-semibold"
            >
              {isLogin ? (isCodesRole ? "使用邀请码激活绑定" : "注册新账号") : "返回登录"}
            </Button>
          </div>
          {role === "student" && isLogin ? (
            <p className="text-center text-caption text-fg-3">
              学生账号由老师统一创建并发放，无需自主注册。
            </p>
          ) : null}
          {isLogin ? (
            <p className="text-center text-caption text-fg-3">
              身份选错时会提示「账号或密码错误」，请先确认上方身份。
            </p>
          ) : null}
        </div>
      </AuthLayout>
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
      <div className="relative flex justify-center text-caption">
        <span className="bg-surface-1 px-3 font-medium text-fg-3">{label}</span>
      </div>
    </div>
  );
}

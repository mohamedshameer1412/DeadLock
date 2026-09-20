"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Mail, UserRound } from "lucide-react";
import { api, clearOfflineData, fetchSession } from "@/lib/api";
import { keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { AuthHeader, AuthShell, SecureNote } from "@/components/nexus/auth-shell";
import { Field, FormError, PasswordField, SubmitButton } from "@/components/nexus/auth-fields";

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;

const slide = (direction) => ({
  initial: { opacity: 0, x: direction * 100 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: direction * -100 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
});

function validate(mode, f) {
  const e = {};
  if (mode === "login") {
    if (!f.email.trim()) e.email = "Enter your email address.";
    if (!f.password) e.password = "Enter your password.";
    return e;
  }
  if (!USERNAME.test(f.username.trim())) e.username = "Use 3 to 32 letters, digits, dot, dash or underscore, starting with a letter or digit.";
  if (!EMAIL.test(f.email.trim())) e.email = "Enter a valid email address, for example you@example.com.";
  if (f.password.length < 8) e.password = "Use at least 8 characters.";
  else if (f.password.length > 128) e.password = "Use at most 128 characters.";
  if (!e.password && f.confirm !== f.password) e.confirm = "The two passwords do not match.";
  if (!f.agree) e.agree = "Please confirm this to continue.";
  return e;
}

/** Sign in and sign up on one screen, with the sliding switch from the template. The address bar follows the mode (/login or /register). */
export default function AuthScreen({ initial = "login" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState(initial);
  const [direction, setDirection] = useState(1);
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "", agree: false });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const first = useRef(null);
  const isLogin = mode === "login";

  useEffect(() => {
    (async () => {
      const s = await fetchSession();                       // a signed-in visitor goes straight to the app; otherwise this readies the pre-sign-in token
      if (s.authenticated) router.replace("/subjects");
    })();
  }, [router]);

  useEffect(() => { document.title = isLogin ? "Sign in · Nexus" : "Create your account · Nexus"; }, [isLogin]);
  useEffect(() => { first.current?.focus(); }, [mode]);

  const set = (name, value) => { setForm((f) => ({ ...f, [name]: value })); setErrors((e) => ({ ...e, [name]: undefined })); };

  function switchTo(next) {
    setServerError("");
    setErrors({});
    setDirection(next === "register" ? 1 : -1);
    setMode(next);
    window.history.replaceState(null, "", next === "register" ? "/register" : "/login");
  }

  async function submit(ev) {
    ev.preventDefault();
    setServerError("");
    const found = validate(mode, form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await api(isLogin ? "/login" : "/register", { method: "POST", json: isLogin ? { email: form.email.trim(), password: form.password } : { username: form.username.trim(), email: form.email.trim(), password: form.password } });
      qc.removeQueries();
      clearOfflineData();
      await qc.invalidateQueries({ queryKey: keys.session });
      if (!isLogin) toast.success(`Welcome to Nexus. We sent a code to ${form.email.trim()}; enter it under Account to verify your address.`, { duration: 9000 });
      router.replace("/subjects");
    } catch (e) {
      setServerError(friendlyError(e));
      setPending(false);
    }
  }

  return (
    <AuthShell scene={mode} direction={direction}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} className="au-wrap-form" {...slide(direction)}>
          <AuthHeader title={isLogin ? "Welcome back" : "Create your account"} subtitle={isLogin ? "Sign in to continue your learning." : "It takes less than a minute."} />
          <form className="au-form" onSubmit={submit} noValidate>
            <FormError>{serverError}</FormError>

            {!isLogin && (
              <Field
                label="Username" icon={<UserRound size={18} />} placeholder="e.g. priya.k" autoComplete="nickname" inputRef={first} name="username"
                value={form.username} onChange={(e) => set("username", e.target.value)} error={errors.username} maxLength={32} spellCheck={false} autoCapitalize="none"
                hint="Shown in the top bar. Letters, digits, dot, dash or underscore."
              />
            )}

            <Field
              label="Email address" icon={<Mail size={18} />} placeholder="you@example.com" type={isLogin ? "text" : "email"} inputMode="email" name="email"
              autoComplete={isLogin ? "username" : "email"} inputRef={isLogin ? first : undefined} value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email}
              maxLength={254} spellCheck={false} autoCapitalize="none" hint={isLogin ? "Accounts made before email sign-in can still use their old username here." : "You will use this to sign in and to reset your password."}
            />

            <PasswordField
              label="Password" icon={<Lock size={18} />} placeholder={isLogin ? "Enter your password" : "At least 8 characters"} name="password"
              autoComplete={isLogin ? "current-password" : "new-password"} value={form.password} onChange={(v) => set("password", v)} error={errors.password} showStrength={!isLogin}
            />

            {!isLogin && (
              <PasswordField
                label="Confirm password" icon={<Lock size={18} />} placeholder="Type it again" name="confirm" autoComplete="new-password"
                value={form.confirm} onChange={(v) => set("confirm", v)} error={errors.confirm}
              />
            )}

            {isLogin ? (
              <div className="au-options"><span /><Link href="/forgot-password" className="au-link">Forgot password?</Link></div>
            ) : (
              <div>
                <label className="au-check">
                  <input type="checkbox" checked={form.agree} onChange={(e) => set("agree", e.target.checked)} aria-invalid={!!errors.agree} />
                  <span>I understand that my study materials are stored on this server and are only sent to a cloud model if I allow it in Account.</span>
                </label>
                {errors.agree && <p className="au-field-error" role="alert" style={{ marginTop: 6 }}>{errors.agree}</p>}
              </div>
            )}

            <SubmitButton pending={pending}>{isLogin ? "Sign in" : "Create account"}</SubmitButton>
          </form>

          <div className="au-switch">
            <span>{isLogin ? "New to Nexus?" : "Already have an account?"}</span>
            <button type="button" className="au-link" onClick={() => switchTo(isLogin ? "register" : "login")}>{isLogin ? "Create an account" : "Sign in"}</button>
          </div>
          <SecureNote />
        </motion.div>
      </AnimatePresence>
    </AuthShell>
  );
}

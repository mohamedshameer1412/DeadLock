"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { api, fetchSession } from "@/lib/api";
import { friendlyError } from "@/lib/utils";
import { keys } from "@/lib/queries";
import { Alert, Button, Input, Label } from "@/components/ui/primitives";

const loginSchema = z.object({ username: z.string().min(1, "Enter your username."), password: z.string().min(1, "Enter your password.") });
const registerSchema = z
  .object({
    username: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/, "Use 3 to 32 letters, digits, dot, dash or underscore, starting with a letter or digit."),
    password: z.string().min(8, "Use at least 8 characters.").max(128, "Use at most 128 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match." });

export default function AuthForm({ mode }) {
  const register_ = mode === "register";
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState("");
  const [show, setShow] = useState(false);
  const form = useForm({ resolver: zodResolver(register_ ? registerSchema : loginSchema), defaultValues: { username: "", password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    (async () => {
      const s = await fetchSession(); // a signed-in visitor goes straight to the app; otherwise this readies the pre-session token
      if (s.authenticated) router.replace("/subjects");
    })();
  }, [router]);

  async function onSubmit(values) {
    setServerError("");
    try {
      await api(register_ ? "/register" : "/login", { method: "POST", json: { username: values.username, password: values.password } });
      qc.removeQueries();
      await qc.invalidateQueries({ queryKey: keys.session });
      router.replace("/subjects");
    } catch (e) {
      setServerError(friendlyError(e));
    }
  }

  const field = (name, label, props = {}) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-err` : undefined} {...form.register(name)} {...props} />
      {errors[name] && (
        <p id={`${name}-err`} role="alert" className="mt-1 text-sm text-danger">
          {errors[name].message}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{register_ ? "Create your account" : "Log in"}</h1>
        <p className="text-sm text-muted">{register_ ? "It takes a few seconds." : "Welcome back."}</p>
      </div>
      {serverError && <Alert tone="danger">{serverError}</Alert>}
      {field("username", "Username", { autoComplete: "username", autoFocus: true })}
      <div className="relative">
        {field("password", "Password", { type: show ? "text" : "password", autoComplete: register_ ? "new-password" : "current-password", className: "pr-12" })}
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-[1.6rem] flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-surface-2"
        >
          {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      {register_ && field("confirm", "Repeat password", { type: show ? "text" : "password", autoComplete: "new-password" })}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Please wait…" : register_ ? "Register" : "Log in"}
      </Button>
      <p className="text-center text-sm">
        {register_ ? (
          <>
            Already registered? <Link href="/login">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/register">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}

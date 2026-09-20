"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { api, fetchSession } from "@/lib/api";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Lock, Mail } from "lucide-react";
import { AuthHeader, AuthShell, SecureNote } from "@/components/nexus/auth-shell";
import { Field, FormError, PasswordField, SubmitButton } from "@/components/nexus/auth-fields";

/** Two steps: an email address, then the 6-digit code from the email together with the new password. */
export default function ForgotPasswordPage() {
  useTitle("Reset your password");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => { fetchSession().catch(() => {}); }, []); // the pre-sign-in security token
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send(e) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", json: { email } });
      setStep(2);
      setWait(60);
    } catch (err) {
      if (err.status === 429 && err.retry_after) setWait(err.retry_after);
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e) {
    e.preventDefault();
    setError("");
    if (pw !== pw2) return setError("The two new passwords are not the same.");
    setBusy(true);
    try {
      await api("/auth/password/reset", { method: "POST", json: { email, code: code.trim(), new_password: pw } });
      toast.success("Your password was changed. Please log in.");
      await fetchSession();
      router.replace("/login");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell scene="reset">
      <AuthHeader title="Reset your password" subtitle={step === 1 ? "We will email you a 6-digit code." : "Enter the code and choose a new password."} />
      {step === 1 ? (
        <form onSubmit={send} className="au-form" noValidate>
          <FormError>{error}</FormError>
          <Field id="fp-email" label="Email address" icon={<Mail size={18} />} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoCapitalize="none" spellCheck={false}
            hint="Use the address you signed up with." />
          <SubmitButton pending={busy}>{wait > 0 ? `Try again in ${wait} s` : "Send me a code"}</SubmitButton>
          <p className="au-hint">No email on the account yet (an older account)? Sign in with your username, then add one under Account.</p>
        </form>
      ) : (
        <form onSubmit={reset} className="au-form" noValidate>
          <div className="au-alert au-alert-info" role="status"><MailCheck size={18} aria-hidden="true" /><span>If <b className="break-anywhere">{email}</b> belongs to an account, a code is on its way. It expires in 10 minutes. Check your spam folder too.</span></div>
          <FormError>{error}</FormError>
          <Field id="fp-code" className="au-code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required placeholder="000000" />
          <PasswordField id="fp-pw" label="New password" icon={<Lock size={18} />} autoComplete="new-password" value={pw} onChange={setPw} showStrength placeholder="At least 8 characters" />
          <PasswordField id="fp-pw2" label="New password again" icon={<Lock size={18} />} autoComplete="new-password" value={pw2} onChange={setPw2} placeholder="Type it again" />
          <SubmitButton pending={busy}>Change password</SubmitButton>
          <div className="au-options">
            <button type="button" className="au-link" disabled={busy || wait > 0} onClick={send}>{wait > 0 ? `Send a new code in ${wait} s` : "Send a new code"}</button>
            <button type="button" className="au-link" onClick={() => { setStep(1); setError(""); setCode(""); }}>Use a different address</button>
          </div>
          <p className="au-hint">Never share this code. Nexus staff will never ask for it. After five wrong tries a code stops working.</p>
        </form>
      )}
      <div className="au-switch"><Link href="/login" className="au-link">Back to sign in</Link></div>
      <SecureNote />
    </AuthShell>
  );
}

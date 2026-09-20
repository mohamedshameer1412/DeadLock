"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { api, fetchSession } from "@/lib/api";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Alert, Button, Card, Input, Label } from "@/components/ui/primitives";

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
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      {step === 1 ? (
        <form onSubmit={send} className="mt-4 space-y-3">
          <p className="text-sm text-muted">Enter the email address you verified in your Nexus account. We will send a 6-digit code to it.</p>
          <div><Label htmlFor="fp-email">Email address</Label><Input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={busy || wait > 0}>{busy ? "Sending…" : wait > 0 ? `Try again in ${wait} s` : "Send me a code"}</Button>
          <p className="text-sm">No verified email on the account? Log in and add one under Account, or ask the administrator.</p>
        </form>
      ) : (
        <form onSubmit={reset} className="mt-4 space-y-3">
          <Alert tone="info"><span className="flex items-start gap-2"><MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>If <b className="break-anywhere">{email}</b> belongs to an account, a code is on its way. It expires in 10 minutes. Check your spam folder too.</span></span></Alert>
          <div><Label htmlFor="fp-code">6-digit code</Label><Input id="fp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required className="text-center text-2xl tracking-[0.5em]" /></div>
          <div><Label htmlFor="fp-pw">New password</Label><Input id="fp-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required maxLength={200} /></div>
          <div><Label htmlFor="fp-pw2">New password again</Label><Input id="fp-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required maxLength={200} /></div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? "Changing…" : "Change password"}</Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" className="min-h-11 text-link underline disabled:no-underline disabled:opacity-60" disabled={busy || wait > 0} onClick={send}>{wait > 0 ? `Send a new code in ${wait} s` : "Send a new code"}</button>
            <button type="button" className="min-h-11 text-link underline" onClick={() => { setStep(1); setError(""); setCode(""); }}>Use a different address</button>
          </div>
          <p className="text-xs text-muted">Never share this code. Nexus staff will never ask for it. After five wrong tries a code stops working.</p>
        </form>
      )}
      <p className="mt-4 text-sm"><Link href="/login">Back to log in</Link></p>
    </Card>
  );
}

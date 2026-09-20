"use client";
import { useId, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

/** A labelled input with an icon, an optional hint and an error that is announced to screen readers. */
export function Field({ label, icon, error, hint, endIcon, className = "", id: given, inputRef, ...input }) {
  const auto = useId();
  const id = given ?? auto;
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`au-group ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="au-wrap" data-invalid={error ? "true" : "false"}>
        {icon && <span className="au-icon" aria-hidden="true">{icon}</span>}
        <input id={id} ref={inputRef} aria-invalid={!!error} aria-describedby={describedBy} {...input} />
        {endIcon && <span className="au-end">{endIcon}</span>}
      </div>
      {error && <p id={`${id}-err`} className="au-field-error" role="alert">{error}</p>}
      {hint && !error && <p id={`${id}-hint`} className="au-hint">{hint}</p>}
    </div>
  );
}

/** A password input with a show/hide button, a Caps Lock warning and, for a new password, a strength bar. */
export function PasswordField({ label, icon, value, onChange, autoComplete, error, hint, showStrength = false, placeholder, id, name }) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const score = strength(value);
  return (
    <div>
      <Field
        id={id} name={name} label={label} icon={icon} error={error} hint={hint} placeholder={placeholder} autoComplete={autoComplete}
        type={visible ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} maxLength={128}
        onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} onBlur={() => setCaps(false)} spellCheck={false} autoCapitalize="none"
        endIcon={
          <button type="button" className="au-icon-btn" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        }
      />
      {caps && <p className="au-caps" role="status">Caps Lock is on.</p>}
      {showStrength && value && (
        <div style={{ marginTop: 8 }}>
          <div className="au-strength" data-score={score.score} aria-hidden="true"><i /><i /><i /><i /></div>
          <p className="au-hint" style={{ marginTop: 6 }} role="status">Password strength: <b>{score.label}</b>{score.tip ? `. ${score.tip}` : ""}</p>
        </div>
      )}
    </div>
  );
}

/** A plain length-and-variety rule of thumb, shown as advice only. The server enforces the real rules (8 to 128 characters). */
export function strength(pw) {
  const p = pw || "";
  if (!p) return { score: 0, label: "", tip: "" };
  let points = 0;
  if (p.length >= 8) points += 1;
  if (p.length >= 12) points += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) points += 1;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) points += 1;
  if (/^(.)\1+$/.test(p) || /^(password|12345678|qwertyui)/i.test(p)) points = Math.min(points, 1);
  const score = Math.max(1, Math.min(4, points));
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score], tip: p.length < 8 ? "Use at least 8 characters" : score < 3 ? "A longer phrase with mixed characters is stronger" : "" };
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="au-alert au-alert-error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function SubmitButton({ children, pending }) {
  return (
    <button type="submit" className="au-primary" disabled={pending} aria-busy={pending}>
      {pending ? <><Loader2 size={18} className="au-spin" aria-hidden="true" /> Please wait…</> : <>{children}<ArrowRight size={18} aria-hidden="true" /></>}
    </button>
  );
}

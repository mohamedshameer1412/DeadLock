"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { api, fetchSession } from "@/lib/api";
import { getAccount, keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { EmailSettings } from "@/components/nexus/email-settings";
import { ErrorState, useLogout } from "@/components/nexus/shell";
import { Alert, Button, Card, Checkbox, Dialog, DialogClose, DialogContent, DialogTrigger, Input, Label, Skeleton } from "@/components/ui/primitives";

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState("");
  const save = useMutation({
    mutationFn: () => api("/account/password", { method: "POST", json: { current, new: next } }),
    onSuccess: () => { setCurrent(""); setNext(""); setAgain(""); setProblem(""); toast.success("Password changed. Your other devices were signed out."); },
    onError: (e) => setProblem(friendlyError(e)),
  });
  return (
    <Card className="mt-6">
      <h2 className="text-lg font-bold">Change password</h2>
      <form className="mt-3 max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); setProblem(""); if (next !== again) return setProblem("The two new passwords are not the same."); save.mutate(); }}>
        <div><Label htmlFor="pw-current">Current password</Label><Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></div>
        <div><Label htmlFor="pw-again">New password again</Label><Input id="pw-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></div>
        {problem && <Alert tone="danger">{problem}</Alert>}
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Change password"}</Button>
      </form>
    </Card>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState("");
  const del = useMutation({
    mutationFn: () => api("/account/delete", { method: "POST", json: { password, confirm } }),
    onSuccess: async () => { qc.clear(); await fetchSession(); toast.success("Your account and all its data were deleted."); router.replace("/login"); },
    onError: (e) => setProblem(friendlyError(e)),
  });
  return (
    <Card className="mt-6 border-danger">
      <h2 className="text-lg font-bold text-danger">Delete my account</h2>
      <p className="mt-1 text-sm">Permanently removes every subject, uploaded file, question, quiz and score, then the account itself. This cannot be undone. Download your data first if you want a copy.</p>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPassword(""); setConfirm(""); setProblem(""); } }}>
        <DialogTrigger asChild><Button variant="danger" className="mt-3"><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete my account…</Button></DialogTrigger>
        <DialogContent title="Delete your account?" description="Everything you uploaded and every score will be erased for good.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setProblem(""); del.mutate(); }}>
            <div><Label htmlFor="del-pw">Your password</Label><Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div><Label htmlFor="del-word">Type DELETE to confirm</Label><Input id="del-word" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required /></div>
            {problem && <Alert tone="danger">{problem}</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
              <Button type="submit" variant="danger" disabled={del.isPending || confirm !== "DELETE" || !password}>{del.isPending ? "Deleting…" : "Delete everything"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AccountPage() {
  useTitle("Account");
  const qc = useQueryClient();
  const logout = useLogout();
  const [local, setLocal] = useState(null); // the switch moves the instant it is clicked
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.account, queryFn: getAccount });
  const save = useMutation({
    mutationFn: (consent) => api("/account/cloud", { method: "PUT", json: { consent } }),
    onSuccess: (r) => toast.success(r.cloud_consent ? "Cloud fallback allowed" : "Cloud fallback off"),
    onError: (e) => toast.error(friendlyError(e)),
    // Whatever happened, take the server's answer and drop the local value (a refused change flips the switch back).
    onSettled: async () => { await qc.invalidateQueries({ queryKey: keys.account }); setLocal(null); },
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-40" />;
  const on = local ?? data.user.cloud_consent;
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Account</h1>
      <p className="text-sm text-muted">Signed in as <b>{data.user.username}</b></p>
      <Card className="mt-5">
        <h2 className="text-lg font-bold">Cloud models</h2>
        <p className="mt-1 text-sm">If you allow it, Nexus asks a fast cloud model (OpenRouter) first, and uses the model on this computer as the backup when the cloud is unavailable or the shared credit runs low. Small checks always run on this computer.</p>
        <p className="mt-2 text-sm"><b>If you allow this, the passages found for your question (a few paragraphs, never your whole files) are sent to OpenRouter and the model provider.</b> If you do not, nothing ever leaves this computer.</p>
        <p className="mt-2 text-xs text-muted">Cloud key configured on the server: <b>{data.key_configured ? "yes" : "no"}</b>{data.allowed_models.length > 0 && <> · allowed models: {data.allowed_models.join(", ")}</>}</p>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
          <Checkbox aria-label="Use cloud models first, with this computer as the backup" checked={on} onCheckedChange={(checked) => { setLocal(!!checked); save.mutate(!!checked); }} />
          <span className="text-sm font-semibold">Use cloud models (OpenRouter) first, with this computer as the backup</span>
        </label>
      </Card>

      {data.email && <EmailSettings info={data.email} />}

      <ChangePassword />

      <Card className="mt-6">
        <h2 className="text-lg font-bold">Your data</h2>
        <p className="mt-1 text-sm">Download everything the account holds (subjects, the text of your materials, questions, practice questions, quizzes and answers) as one file.</p>
        <Button asChild variant="secondary" className="mt-3"><a href="/api/v1/account/export" download><Download className="h-4 w-4" aria-hidden="true" /> Download my data (JSON)</a></Button>
      </Card>

      <DeleteAccount />
      <div className="mt-6"><Button variant="secondary" onClick={logout}>Log out</Button></div>
    </div>
  );
}

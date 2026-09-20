"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getAccount, keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ErrorState, useLogout } from "@/components/nexus/shell";
import { Button, Card, Checkbox, Skeleton } from "@/components/ui/primitives";

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
        <p className="mt-1 text-sm">Questions are answered by a model running on this computer first. If that fails, Nexus can ask a cloud model (OpenRouter) instead.</p>
        <p className="mt-2 text-sm"><b>If you allow this, the passages found for your question (a few paragraphs, never your whole files) are sent to OpenRouter and the model provider.</b> If you do not, nothing ever leaves this computer.</p>
        <p className="mt-2 text-xs text-muted">Cloud key configured on the server: <b>{data.key_configured ? "yes" : "no"}</b>{data.allowed_models.length > 0 && <> · allowed models: {data.allowed_models.join(", ")}</>}</p>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3">
          <Checkbox aria-label="Allow cloud models as a fallback for my questions" checked={on} onCheckedChange={(checked) => { setLocal(!!checked); save.mutate(!!checked); }} />
          <span className="text-sm font-semibold">Allow cloud models as a fallback for my questions</span>
        </label>
      </Card>
      <div className="mt-6"><Button variant="secondary" onClick={logout}>Log out</Button></div>
    </div>
  );
}

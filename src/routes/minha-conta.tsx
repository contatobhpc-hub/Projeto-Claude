import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/permissions";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/minha-conta")({
  head: () => ({ meta: [{ title: "Minha conta — Marketing Hub" }] }),
  component: MyAccount,
});

function MyAccount() {
  const { profile, refresh } = usePermissions();
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setJobTitle(profile?.job_title ?? "");
  }, [profile?.full_name, profile?.job_title]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), job_title: jobTitle.trim() })
        .eq("id", profile.id);
      if (error) throw error;
      await refresh();
      toast.success("Dados salvos.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      toast.success("Senha alterada.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <>
      <PageHeader title="Minha conta" description="Seus dados aparecem para a equipe em atribuições, comentários e histórico." />
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveProfile} className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-base font-semibold">Dados pessoais</h2>
          <div className="space-y-1.5">
            <Label htmlFor="fn">Nome completo</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jt">Função na equipe</Label>
            <Input id="jt" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Ex.: Analista de Comunicação" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">E-mail</div>
              <div className="truncate">{profile?.email}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cargo no sistema</div>
              <div>{profile?.role?.name ?? "—"}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">O cargo é definido por um Administrador.</p>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </form>

        <form onSubmit={savePassword} className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-base font-semibold">Alterar senha</h2>
          <div className="space-y-1.5">
            <Label htmlFor="np">Nova senha</Label>
            <Input id="np" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" variant="outline" disabled={savingPw}>
            {savingPw && <Loader2 className="h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </form>
      </div>
    </>
  );
}

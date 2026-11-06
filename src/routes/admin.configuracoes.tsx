import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <SettingsPage />
    </ModuleGuard>
  ),
});

type Org = { name: string; area: string };
type Signup = { allowed_domains: string[] };

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value");
      if (error) throw error;
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      return {
        org: (map.organization ?? { name: "", area: "" }) as Org,
        signup: (map.signup ?? { allowed_domains: [] }) as Signup,
      };
    },
  });

  const [orgName, setOrgName] = useState("");
  const [area, setArea] = useState("");
  const [domains, setDomains] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setOrgName(data.org.name ?? "");
    setArea(data.org.area ?? "");
    setDomains((data.signup.allowed_domains ?? []).join(", "));
  }, [data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = domains
      .split(/[,\s]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    const invalid = list.find((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
    if (invalid) {
      toast.error(`"${invalid}" não parece um domínio válido (ex.: sicoobcredibelo.com.br).`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert([
      { key: "organization", value: { name: orgName.trim(), area: area.trim() } as unknown as Json },
      { key: "signup", value: { allowed_domains: list } as unknown as Json },
    ]);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("Configurações salvas.");
    void qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  return (
    <>
      <PageHeader title="Configurações" description="Ajustes gerais da plataforma. Cada alteração fica registrada no histórico." />
      <form onSubmit={submit} className="max-w-2xl space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-base font-semibold">Organização</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="org">Nome</Label>
              <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">Área</Label>
              <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} disabled={isLoading} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <h2 className="font-display text-base font-semibold">Quem pode se cadastrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deixe em branco para aceitar qualquer e-mail (todos entram sem acesso até você liberar). Preencha para aceitar só
              e-mails desses domínios.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domains">Domínios permitidos</Label>
            <Input
              id="domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="sicoobcredibelo.com.br, sicoob.com.br"
              disabled={isLoading}
            />
          </div>
        </section>

        <Button type="submit" disabled={busy || isLoading}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar configurações
        </Button>
      </form>
    </>
  );
}

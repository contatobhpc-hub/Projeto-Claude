import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { moneyInput, parseMoney } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { brl } from "@/lib/operacao";
import { useAppLists, useAppSettings } from "@/lib/relacionamento";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <SettingsPage />
    </ModuleGuard>
  ),
});

type Org = { name?: string; area?: string };
type Signup = { allowed_domains?: string[] };

const lines = (s: string) => [...new Set(s.split("\n").map((x) => x.trim()).filter(Boolean))];

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAppSettings();
  const lists = useAppLists();

  const [orgName, setOrgName] = useState("");
  const [area, setArea] = useState("");
  const [domains, setDomains] = useState("");
  const [partnerCats, setPartnerCats] = useState("");
  const [contractCats, setContractCats] = useState("");
  const [mediaCats, setMediaCats] = useState("");
  const [budgets, setBudgets] = useState<{ year: string; amount: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const org = (data.organization ?? {}) as Org;
    const signup = (data.signup ?? {}) as Signup;
    const sb = (data.sponsorship_budget ?? {}) as Record<string, number>;
    setOrgName(org.name ?? "");
    setArea(org.area ?? "");
    setDomains((signup.allowed_domains ?? []).join(", "));
    setPartnerCats(lists.partner_categories.join("\n"));
    setContractCats(lists.contract_categories.join("\n"));
    setMediaCats(lists.media_categories.join("\n"));
    setBudgets(
      Object.entries(sb)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, amount]) => ({ year, amount: moneyInput(Number(amount)) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const domainList = domains
      .split(/[,\s]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    const invalid = domainList.find((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
    if (invalid) return void toast.error(`"${invalid}" não parece um domínio válido (ex.: sicoobcredibelo.com.br).`);

    const budgetMap: Record<string, number> = {};
    for (const b of budgets) {
      if (!b.year.trim() && !b.amount.trim()) continue;
      const amount = parseMoney(b.amount);
      if (!/^\d{4}$/.test(b.year.trim()) || Number.isNaN(amount) || amount < 0) {
        return void toast.error("Na verba de patrocínios, use ano com 4 dígitos e valor em reais.");
      }
      budgetMap[b.year.trim()] = amount;
    }
    const pc = lines(partnerCats), cc = lines(contractCats), mc = lines(mediaCats);
    if (!pc.length || !cc.length || !mc.length) return void toast.error("Cada lista de categorias precisa de pelo menos um item.");

    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert([
      { key: "organization", value: { name: orgName.trim(), area: area.trim() } as unknown as Json },
      { key: "signup", value: { allowed_domains: domainList } as unknown as Json },
      { key: "lists", value: { partner_categories: pc, contract_categories: cc, media_categories: mc } as unknown as Json },
      { key: "sponsorship_budget", value: budgetMap as unknown as Json },
    ]);
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Configurações salvas.");
    void qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  return (
    <>
      <PageHeader title="Configurações" description="Ajustes gerais da plataforma. Cada alteração fica registrada no histórico." />
      <form onSubmit={submit} className="max-w-3xl space-y-6">
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
              Em branco aceita qualquer e-mail (todos entram sem acesso até você liberar). Preenchido, aceita só e-mails desses domínios.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domains">Domínios permitidos</Label>
            <Input id="domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="sicoobcredibelo.com.br, sicoob.com.br" disabled={isLoading} />
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <h2 className="font-display text-base font-semibold">Listas de categorias</h2>
            <p className="mt-1 text-sm text-muted-foreground">Uma por linha. Registros antigos mantêm a categoria mesmo que ela saia da lista.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pc">Parceiros</Label>
              <Textarea id="pc" rows={10} value={partnerCats} onChange={(e) => setPartnerCats(e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc">Contratos</Label>
              <Textarea id="cc" rows={10} value={contractCats} onChange={(e) => setContractCats(e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc">Formatos de mídia offline</Label>
              <Textarea id="mc" rows={10} value={mediaCats} onChange={(e) => setMediaCats(e.target.value)} disabled={isLoading} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div>
            <h2 className="font-display text-base font-semibold">Verba anual de patrocínios</h2>
            <p className="mt-1 text-sm text-muted-foreground">Usada na tela de Patrocínios para mostrar quanto já foi comprometido.</p>
          </div>
          <div className="space-y-2">
            {budgets.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="w-24" value={b.year} placeholder="Ano" onChange={(e) => setBudgets(budgets.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
                <Input className="w-48" inputMode="decimal" value={b.amount} placeholder="Valor (R$)" onChange={(e) => setBudgets(budgets.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <span className="text-sm text-muted-foreground">{b.amount && !Number.isNaN(parseMoney(b.amount)) ? brl(parseMoney(b.amount)) : ""}</span>
                <Button type="button" size="icon" variant="ghost" aria-label="Remover ano" onClick={() => setBudgets(budgets.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setBudgets([{ year: String(new Date().getFullYear() + 1), amount: "" }, ...budgets])}>
              <Plus className="h-4 w-4" /> Adicionar ano
            </Button>
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

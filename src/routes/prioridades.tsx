import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ops/record-panels";
import { brl, fmtDate, todayISO, useCampaigns, useContents, useProjects, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import {
  contractAlert,
  daysUntil,
  nextSponsorshipDeadline,
  removalAlert,
  stockLevel,
  useContracts,
  useInventory,
  useMktEvents,
  useOfflineMedia,
  useSponsorships,
} from "@/lib/relacionamento";
import { paymentState, useInvoices, usePayments, usePurchaseRequests } from "@/lib/financeiro";
import { useObjectives } from "@/lib/inteligencia";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/prioridades")({
  head: () => ({ meta: [{ title: "Central de Prioridades — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="prioridades">
      <PrioritiesPage />
    </ModuleGuard>
  ),
});

type Level = "critico" | "alto" | "medio";
type Item = { key: string; level: Level; group: string; title: string; detail: string; link: string; mine: boolean; sort: number };

const LEVEL: Record<Level, { label: string; icon: LucideIcon; tone: string }> = {
  critico: { label: "Crítico", icon: AlertOctagon, tone: "text-red-600 dark:text-red-400" },
  alto: { label: "Alto", icon: AlertTriangle, tone: "text-orange-600 dark:text-orange-400" },
  medio: { label: "Atenção", icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
};

function PrioritiesPage() {
  const router = useRouter();
  const { can, profile } = usePermissions();
  const { data: profiles } = useProfiles();
  const me = profile?.id;
  const board = ["diretoria", "admin"].includes(profile?.role?.key ?? "");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const today = todayISO();
  const year = new Date().getFullYear();

  const { data: tasks = [] } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: campaigns = [] } = useCampaigns();
  const { data: contents = [] } = useContents();
  const { data: contracts = [] } = useContracts();
  const { data: inventory = [] } = useInventory();
  const { data: media = [] } = useOfflineMedia();
  const { data: sponsorships = [] } = useSponsorships();
  const { data: events = [] } = useMktEvents();
  const { data: purchases = [] } = usePurchaseRequests();
  const { data: invoices = [] } = useInvoices([{ column: "status", value: "Pendente" }]);
  const { data: payments = [] } = usePayments([{ column: "status", value: "Agendado" }]);
  const { data: objectives = [] } = useObjectives(year);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const who = (id: string | null) => (id ? profileName(profiles, id) : "sem responsável");

    // Tarefas
    for (const t of tasks) {
      if (["Concluído", "Cancelado"].includes(t.status) || !t.due_date) continue;
      const d = daysUntil(t.due_date)!;
      if (d > 3) continue;
      out.push({
        key: `t-${t.id}`, level: d < 0 ? "critico" : d === 0 ? "alto" : "medio", group: "Tarefas",
        title: t.title, detail: `${d < 0 ? `Atrasada ${-d} dia(s)` : d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`} · ${who(t.assignee_id)}`,
        link: "/kanban", mine: t.assignee_id === me, sort: d,
      });
    }
    // Projetos atrasados
    for (const p of projects) {
      if (p.status === "Concluído" || !p.due_date || p.due_date >= today) continue;
      out.push({
        key: `p-${p.id}`, level: "alto", group: "Projetos", title: p.name, detail: `Prazo era ${fmtDate(p.due_date)} · ${who(p.owner_id)}`,
        link: `/projetos/${p.id}`, mine: p.owner_id === me || p.team_ids.includes(me ?? ""), sort: daysUntil(p.due_date)!,
      });
    }
    // Aprovações
    const approval = (cond: boolean, key: string, title: string, detail: string, link: string, created: string) => {
      if (cond) out.push({ key, level: "alto", group: "Aprovações", title, detail, link, mine: true, sort: -Math.round((Date.now() - new Date(created).getTime()) / 86_400_000) });
    };
    if (can("campanhas", "approve")) for (const c of campaigns) approval(c.approval_status === "Aguardando", `ac-${c.id}`, `Aprovar campanha: ${c.name}`, "Campanha aguardando decisão", `/campanhas/${c.id}`, c.updated_at);
    if (can("projetos", "approve")) for (const p of projects) approval(p.approval_status === "Aguardando", `ap-${p.id}`, `Aprovar projeto: ${p.name}`, "Projeto aguardando decisão", `/projetos/${p.id}`, p.updated_at);
    if (can("contratos", "approve")) for (const c of contracts) approval(c.approval_status === "Aguardando", `act-${c.id}`, `Aprovar contrato: ${c.object}`, brl(Number(c.value)), `/contratos/${c.id}`, c.updated_at);
    if (can("conteudos", "approve")) for (const c of contents) approval(c.status === "Aguardando aprovação", `acn-${c.id}`, `Aprovar conteúdo: ${c.title}`, c.category, `/conteudos?id=${c.id}`, c.updated_at);
    if (can("planejamento", "approve")) for (const o of objectives) approval(o.approval_status === "Aguardando", `ao-${o.id}`, `Aprovar objetivo: ${o.title}`, `Planejamento ${o.year}`, "/planejamento", o.updated_at);
    if (can("fin_compras", "approve")) {
      for (const p of purchases) {
        approval(
          p.requester_id !== me && (p.status === "Solicitado" || (p.status === "Em aprovação" && board)),
          `apr-${p.id}`, `Aprovar compra ${p.code}: ${p.description}`, `${brl(Number(p.estimated_value))} · pedido de ${who(p.requester_id)}`, `/compras?id=${p.id}`, p.updated_at,
        );
      }
    }
    if (can("fin_orcamento", "approve")) for (const i of invoices) approval(true, `ai-${i.id}`, `Aprovar NF ${i.number}`, brl(Number(i.value)), "/financeiro?tab=notas", i.created_at);
    // Meus pedidos de compra parados
    for (const p of purchases) {
      if (p.requester_id === me && p.status === "Rascunho") {
        out.push({ key: `pr-${p.id}`, level: "medio", group: "Compras", title: `Pedido em rascunho: ${p.description}`, detail: "Ainda não foi enviado para aprovação", link: `/compras?id=${p.id}`, mine: true, sort: 5 });
      }
    }
    // Contratos
    for (const c of contracts) {
      const a = contractAlert(c);
      if (!["expired", "critical", "warning"].includes(a.level)) continue;
      out.push({
        key: `c-${c.id}`, level: a.level === "warning" ? "medio" : "critico", group: "Contratos", title: c.object, detail: a.label,
        link: `/contratos/${c.id}`, mine: c.owner_id === me, sort: a.days ?? 0,
      });
    }
    // Pagamentos
    for (const p of payments) {
      const st = paymentState(p);
      const d = daysUntil(p.due_date)!;
      if (st !== "Atrasado" && d > 3) continue;
      out.push({
        key: `pg-${p.id}`, level: st === "Atrasado" ? "critico" : "alto", group: "Pagamentos", title: p.description,
        detail: `${brl(Number(p.value))} · ${st === "Atrasado" ? `venceu ${fmtDate(p.due_date)}` : `vence ${fmtDate(p.due_date)}`}`,
        link: "/financeiro?tab=pagamentos", mine: can("fin_orcamento", "edit"), sort: d,
      });
    }
    // Estoque
    for (const i of inventory) {
      const lv = stockLevel(i);
      if (lv === "ok") continue;
      out.push({
        key: `s-${i.id}`, level: lv === "out" ? "alto" : "medio", group: "Brindes", title: i.name,
        detail: `${i.quantity - i.reserved} disponível(is) · mínimo ${i.min_quantity}`, link: "/brindes", mine: can("brindes", "edit"), sort: 10,
      });
    }
    // Mídia
    for (const m of media) {
      const a = removalAlert(m);
      if (a.level === "none") continue;
      out.push({ key: `m-${m.id}`, level: a.level === "expired" ? "critico" : "alto", group: "Mídia Offline", title: m.title, detail: a.label, link: `/midia-offline?id=${m.id}`, mine: m.owner_id === me, sort: daysUntil(m.removal_date) ?? 0 });
    }
    // Patrocínios
    for (const s of sponsorships) {
      const dl = nextSponsorshipDeadline(s);
      if (!dl || dl.days > 7) continue;
      out.push({ key: `sp-${s.id}`, level: dl.days < 0 ? "critico" : "alto", group: "Patrocínios", title: s.event_name, detail: `${dl.label}: ${fmtDate(dl.date)}`, link: `/patrocinios?id=${s.id}`, mine: s.owner_id === me, sort: dl.days });
    }
    // Eventos próximos
    for (const e of events) {
      if (["Concluído", "Cancelado"].includes(e.status) || !e.event_date) continue;
      const d = daysUntil(e.event_date)!;
      if (d < 0 || d > 7) continue;
      out.push({
        key: `e-${e.id}`, level: d <= 2 ? "alto" : "medio", group: "Eventos", title: e.name,
        detail: `${d === 0 ? "Hoje" : `Em ${d} dia(s)`} · status ${e.status}`, link: `/eventos/${e.id}`,
        mine: e.assignee_id === me || e.team_ids.includes(me ?? ""), sort: d,
      });
    }
    const order: Record<Level, number> = { critico: 0, alto: 1, medio: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level] || a.sort - b.sort);
  }, [tasks, projects, campaigns, contents, contracts, inventory, media, sponsorships, events, purchases, invoices, payments, objectives, profiles, me, board, can, today]);

  const visible = scope === "mine" ? items.filter((i) => i.mine) : items;
  const byLevel = (l: Level) => visible.filter((i) => i.level === l).length;

  return (
    <>
      <PageHeader title="Central de Prioridades" description="Tudo que está atrasado, vencendo ou esperando decisão, em ordem de urgência." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
          <TabsList>
            <TabsTrigger value="mine">Para mim ({items.filter((i) => i.mine).length})</TabsTrigger>
            <TabsTrigger value="team">Equipe toda ({items.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-4 text-sm">
          {(["critico", "alto", "medio"] as Level[]).map((l) => {
            const L = LEVEL[l];
            return (
              <span key={l} className="flex items-center gap-1.5">
                <L.icon className={`h-4 w-4 ${L.tone}`} /> {L.label}: <strong className="tabular-nums">{byLevel(l)}</strong>
              </span>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nada urgente" desc={scope === "mine" ? "Você não tem pendências urgentes. Veja a equipe toda para ajudar onde precisa." : "A equipe está em dia."} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {visible.map((i) => {
            const L = LEVEL[i.level];
            return (
              <li key={i.key}>
                <button type="button" onClick={() => router.history.push(i.link)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  <L.icon className={`h-5 w-5 shrink-0 ${L.tone}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{i.detail}</span>
                  </span>
                  <span className="hidden shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">{i.group}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

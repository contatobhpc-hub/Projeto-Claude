import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, CircleDashed, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Pill } from "@/components/ops/fields";
import { Panel, Stat } from "@/components/ops/record-panels";
import { TaskDialog } from "@/components/ops/task-dialog";
import type { TaskRow } from "@/integrations/supabase/types";
import { CURRENT_PHASE } from "@/lib/navigation";
import { DOT, fmtDate, isOverdue, todayISO, useCampaigns, useContents, useEvents, useProjects, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { useProfiles } from "@/lib/team";
import { paymentState, useInvoices, usePayments, usePurchaseRequests } from "@/lib/financeiro";
import { contractAlert, nextSponsorshipDeadline, removalAlert, stockLevel, useContracts, useInventory, useOfflineMedia, useSponsorships } from "@/lib/relacionamento";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="dashboard">
      <Dashboard />
    </ModuleGuard>
  ),
});

const PHASES = [
  { n: 1, title: "Fundação", body: "Login, usuários, cargos, permissões, histórico, lixeira e anexos." },
  { n: 2, title: "Operação", body: "Campanhas, Projetos, Kanban, Calendário e Conteúdos." },
  { n: 3, title: "Relacionamento e materiais", body: "Parceiros, Contratos, Eventos, Patrocínios, Mídia Offline e Brindes." },
  { n: 4, title: "Financeiro e aprovações", body: "Orçamento, despesas, compras, notas, pagamentos e aprovações." },
  { n: 5, title: "Inteligência", body: "Prioridades, Notificações, Planejamento, Indicadores, Analytics, Workflows e Central IA." },
];

function Dashboard() {
  const { profile, isAdmin, can } = usePermissions();
  const firstName = (profile?.full_name || "").split(" ")[0];
  const today = todayISO();
  const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data: tasks = [] } = useTasks();
  const { data: events = [] } = useEvents({ from: today, to: in7 });
  const { data: campaigns = [] } = useCampaigns();
  const { data: projects = [] } = useProjects();
  const { data: contents = [] } = useContents();
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);
  const { data: contracts = [] } = useContracts();
  const { data: inventory = [] } = useInventory();
  const { data: media = [] } = useOfflineMedia();
  const { data: sponsorships = [] } = useSponsorships();
  const { data: purchases = [] } = usePurchaseRequests();
  const { data: pendingInvoices = [] } = useInvoices([{ column: "status", value: "Pendente" }]);
  const { data: scheduled = [] } = usePayments([{ column: "status", value: "Agendado" }]);
  const latePayments = scheduled.filter((p) => paymentState(p) === "Atrasado");

  const alerts: { label: string; n: number; to: "/contratos" | "/brindes" | "/midia-offline" | "/patrocinios" | "/financeiro"; tone: string }[] = [
    { label: "pagamentos atrasados", n: latePayments.length, to: "/financeiro", tone: "border-red-500/40 bg-red-500/10" },
    {
      label: "contratos vencidos ou vencendo em 30 dias",
      n: contracts.filter((c) => ["expired", "critical", "warning"].includes(contractAlert(c).level)).length,
      to: "/contratos",
      tone: "border-red-500/40 bg-red-500/10",
    },
    { label: "brindes com estoque baixo ou zerado", n: inventory.filter((i) => stockLevel(i) !== "ok").length, to: "/brindes", tone: "border-amber-500/40 bg-amber-500/10" },
    {
      label: "mídias para retirar nos próximos 7 dias",
      n: media.filter((m) => ["expired", "critical", "soon"].includes(removalAlert(m).level)).length,
      to: "/midia-offline",
      tone: "border-amber-500/40 bg-amber-500/10",
    },
    {
      label: "patrocínios com prazo nos próximos 7 dias",
      n: sponsorships.filter((x) => {
        const d = nextSponsorshipDeadline(x);
        return !!d && d.days <= 7;
      }).length,
      to: "/patrocinios",
      tone: "border-amber-500/40 bg-amber-500/10",
    },
  ].filter((a) => a.n > 0);

  const myOpen = tasks
    .filter((t) => t.assignee_id === profile?.id && !["Concluído", "Cancelado"].includes(t.status))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const myLate = myOpen.filter((t) => isOverdue(t.due_date, false)).length;
  const teamLate = tasks.filter((t) => isOverdue(t.due_date, ["Concluído", "Cancelado"].includes(t.status))).length;

  const pending: { label: string; to: "/campanhas" | "/projetos" | "/conteudos" | "/contratos" | "/compras" | "/financeiro"; n: number }[] = [];
  const board = ["diretoria", "admin"].includes(profile?.role?.key ?? "");
  if (can("fin_compras", "approve")) {
    pending.push({
      label: "Solicitações de compra aguardando aprovação",
      to: "/compras",
      n: purchases.filter((p) => p.requester_id !== profile?.id && (p.status === "Solicitado" || (p.status === "Em aprovação" && board))).length,
    });
  }
  if (can("fin_orcamento", "approve")) pending.push({ label: "Notas fiscais aguardando aprovação", to: "/financeiro", n: pendingInvoices.length });
  if (can("campanhas", "approve")) pending.push({ label: "Campanhas aguardando aprovação", to: "/campanhas", n: campaigns.filter((c) => c.approval_status === "Aguardando").length });
  if (can("projetos", "approve")) pending.push({ label: "Projetos aguardando aprovação", to: "/projetos", n: projects.filter((p) => p.approval_status === "Aguardando").length });
  if (can("contratos", "approve")) pending.push({ label: "Contratos aguardando aprovação", to: "/contratos", n: contracts.filter((c) => c.approval_status === "Aguardando").length });
  if (can("conteudos", "approve")) pending.push({ label: "Conteúdos aguardando aprovação", to: "/conteudos", n: contents.filter((c) => c.status === "Aguardando aprovação").length });
  const pendingTotal = pending.reduce((s, p) => s + p.n, 0);

  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Olá"}
        description={`Você está como ${profile?.role?.name ?? "—"}. Hoje é ${format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}.`}
      />

      {isAdmin && <PendingUsersCard />}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Minhas tarefas em aberto" value={String(myOpen.length)} hint={myLate ? `${myLate} atrasadas` : "nenhuma atrasada"} />
        <Stat label="Campanhas em andamento" value={String(campaigns.filter((c) => c.status === "Em andamento").length)} />
        <Stat label="Tarefas atrasadas na equipe" value={String(teamLate)} />
        <Stat label="Compromissos nos próximos 7 dias" value={String(events.length)} />
      </div>

      {alerts.length > 0 && (
        <Panel title="Precisa de atenção" className="mb-6">
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <Link key={a.label} to={a.to} className={`rounded-xl border px-4 py-2 text-sm hover:opacity-90 ${a.tone}`}>
                <strong className="tabular-nums">{a.n}</strong> {a.label}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {pendingTotal > 0 && (
        <Panel title="Esperando sua aprovação" className="mb-6">
          <div className="flex flex-wrap gap-2">
            {pending
              .filter((p) => p.n > 0)
              .map((p) => (
                <Link key={p.label} to={p.to} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm hover:bg-amber-500/15">
                  <strong className="tabular-nums">{p.n}</strong> {p.label.toLowerCase()}
                </Link>
              ))}
          </div>
        </Panel>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Minhas próximas tarefas"
          actions={
            can("kanban", "view") && (
              <Link to="/kanban" className="text-xs text-primary hover:underline">
                Abrir Kanban
              </Link>
            )
          }
        >
          {myOpen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída a você em aberto.</p>
          ) : (
            <ul className="divide-y divide-border">
              {myOpen.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenTask(t)} className="flex w-full items-center gap-3 py-2 text-left">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className={`text-xs tabular-nums ${isOverdue(t.due_date, false) ? "font-medium text-red-500" : "text-muted-foreground"}`}>
                      {t.due_date ? fmtDate(t.due_date) : "sem prazo"}
                    </span>
                    <Pill value={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Agenda da semana"
          actions={
            can("calendario", "view") && (
              <Link to="/calendario" className="text-xs text-primary hover:underline">
                Abrir Calendário
              </Link>
            )
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada agendado para os próximos 7 dias.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <span className="w-20 text-xs tabular-nums text-muted-foreground">
                    {fmtDate(e.event_date).slice(0, 5)} {e.start_time?.slice(0, 5) ?? ""}
                  </span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[e.category] ?? "bg-muted-foreground"}`} />
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{e.category}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Fases do novo Marketing Hub">
        <ol className="space-y-3">
          {PHASES.map((p) => {
            const done = p.n <= CURRENT_PHASE;
            return (
              <li key={p.n} className="flex gap-3">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium">
                    Fase {p.n} · {p.title}
                    {done && <span className="ml-2 text-xs font-normal text-primary">disponível</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">{p.body}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <TaskDialog open={openTask !== null} onOpenChange={(o) => !o && setOpenTask(null)} task={openTask} />
    </>
  );
}

function PendingUsersCard() {
  const { data: profiles } = useProfiles();
  const pending = (profiles ?? []).filter((p) => !p.active);
  if (pending.length === 0) return null;
  return (
    <Link
      to="/admin/usuarios"
      className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/8 p-5 transition-colors hover:bg-primary/12"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <UserPlus className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold">
          {pending.length === 1 ? "1 cadastro sem acesso liberado" : `${pending.length} cadastros sem acesso liberado`}
        </div>
        <div className="text-sm text-muted-foreground">Abra Usuários para definir cargo e liberar o acesso.</div>
      </div>
    </Link>
  );
}

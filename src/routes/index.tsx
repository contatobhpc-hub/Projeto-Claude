import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, UserPlus } from "lucide-react";

import { ModuleGuard } from "@/components/permission-gate";
import { Pill } from "@/components/ops/fields";
import { Panel, Stat } from "@/components/ops/record-panels";
import { TaskDialog } from "@/components/ops/task-dialog";
import type { CampaignRow, TaskRow } from "@/integrations/supabase/types";
import { campaignPhase, DOT, fmtDate, isOverdue, todayISO, useCampaigns, useContents, useEvents, useProjects, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { useProfiles } from "@/lib/team";
import { paymentState, useInvoices, usePayments, usePurchaseRequests } from "@/lib/financeiro";
import { contractAlert, nextSponsorshipDeadline, removalAlert, stockLevel, useContracts, useInventory, useOfflineMedia, useSponsorships } from "@/lib/relacionamento";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Painel — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="dashboard">
      <Dashboard />
    </ModuleGuard>
  ),
});


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
      label: "mídias com retirada atrasada ou nos próximos 7 dias",
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

  const contractsDue = contracts.filter((c) => ["expired", "critical", "warning"].includes(contractAlert(c).level)).length;
  const live = campaigns
    .map((c) => ({ c, ph: campaignPhase(c, today) }))
    .filter((x) => x.ph.key === "no_ar")
    .sort((a, b) => (a.c.end_date ?? "").localeCompare(b.c.end_date ?? ""));
  const startingSoon = campaigns.filter((c) => {
    const ph = campaignPhase(c, today);
    return ph.key === "programada" && !!c.start_date && c.start_date <= in7;
  }).length;

  // Foco do dia: o que exige ação, do mais urgente ao menos
  type Focus = { key: string; level: "bad" | "warn"; text: ReactNode; action: string; to?: (typeof alerts)[number]["to"] | (typeof pending)[number]["to"]; onClick?: () => void };
  const focus: Focus[] = [
    ...myOpen
      .filter((t) => isOverdue(t.due_date, false))
      .slice(0, 3)
      .map<Focus>((t) => ({
        key: `t-${t.id}`,
        level: "bad",
        text: (
          <>
            <strong>{t.title}</strong> · tarefa sua, venceu em {fmtDate(t.due_date)}
          </>
        ),
        action: "Abrir",
        onClick: () => setOpenTask(t),
      })),
    ...pending
      .filter((p) => p.n > 0)
      .map<Focus>((p) => ({
        key: p.label,
        level: "warn",
        text: (
          <>
            <strong className="tabular-nums">{p.n}</strong> {p.label.toLowerCase()}
          </>
        ),
        action: "Decidir",
        to: p.to,
      })),
    ...alerts.map<Focus>((a) => ({
      key: a.label,
      level: a.tone.includes("red") ? "bad" : "warn",
      text: (
        <>
          <strong className="tabular-nums">{a.n}</strong> {a.label}
        </>
      ),
      action: "Ver",
      to: a.to,
    })),
  ];

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const headline =
    focus.length === 0
      ? "Nada pendente por aqui. Bom trabalho!"
      : focus.length === 1
        ? "1 coisa pede sua atenção hoje."
        : `${focus.length} coisas pedem sua atenção hoje.`;

  return (
    <>
      <div className="mb-6 flex flex-col gap-1 sm:mb-8">
        <p className="text-sm capitalize text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        <h1 className="font-display text-[clamp(1.45rem,2.6vw,2rem)] font-bold leading-tight">
          {hello}
          {firstName ? `, ${firstName}` : ""}. <span className="text-muted-foreground">{headline}</span>
        </h1>
      </div>

      {isAdmin && <PendingUsersCard />}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          emphasis
          label="Campanhas no ar"
          value={String(live.length)}
          hint={startingSoon ? `${startingSoon} começa${startingSoon > 1 ? "m" : ""} nos próximos 7 dias` : "contadas pelas datas"}
        />
        <Stat label="Tarefas atrasadas na equipe" value={String(teamLate)} tone="bad" hint={myLate ? `${myLate} ${myLate === 1 ? "é sua" : "são suas"}` : "nenhuma sua"} />
        <Stat label="Contratos vencendo em 30 dias" value={String(contractsDue)} hint="inclui os já vencidos" />
        <Stat label="Compromissos em 7 dias" value={String(events.length)} hint={`${myOpen.length} tarefa${myOpen.length === 1 ? "" : "s"} sua${myOpen.length === 1 ? "" : "s"} em aberto`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Foco do dia" className="lg:col-span-2">
          {focus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atrasos, aprovações ou alertas. Aproveite para planejar as próximas campanhas.</p>
          ) : (
            <ul className="-mx-2 flex flex-col gap-1">
              {focus.slice(0, 7).map((f) => {
                const inner = (
                  <>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${f.level === "bad" ? "bg-destructive" : "bg-amber-500"}`} />
                    <span className="min-w-0 flex-1 text-sm">{f.text}</span>
                    <span className={`flex items-center gap-1 text-[13px] font-semibold ${f.level === "bad" ? "text-destructive" : "text-primary-ink"}`}>
                      {f.action} <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </>
                );
                const cls = `flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted ${
                  f.level === "bad" ? "bg-destructive/[0.07]" : ""
                }`;
                return (
                  <li key={f.key}>
                    {f.to ? (
                      <Link to={f.to} className={cls}>
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" onClick={f.onClick} className={cls}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Próximos 7 dias"
          actions={
            can("calendario", "view") && (
              <Link to="/calendario" className="text-[13px] font-semibold text-primary-ink hover:underline">
                Calendário
              </Link>
            )
          }
        >
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada agendado para os próximos 7 dias.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {events.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <div className="w-12 shrink-0 rounded-xl bg-primary/10 py-1.5 text-center">
                    <div className="text-[10px] font-semibold uppercase text-primary-ink">{format(parseISO(e.event_date), "EEE", { locale: ptBR }).slice(0, 3)}</div>
                    <div className="font-display text-lg font-bold leading-none">{format(parseISO(e.event_date), "dd")}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.title}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`h-1.5 w-1.5 rounded-full ${DOT[e.category] ?? "bg-muted-foreground"}`} />
                      {e.category}
                      {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {can("campanhas", "view") && <CampaignTimeline campaigns={campaigns} today={today} />}

      <Panel
        title="Minhas próximas tarefas"
        actions={
          can("kanban", "view") && (
            <Link to="/kanban" className="text-[13px] font-semibold text-primary-ink hover:underline">
              Kanban
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
                <button type="button" onClick={() => setOpenTask(t)} className="flex min-h-[44px] w-full items-center gap-3 py-2 text-left">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className={`text-xs tabular-nums ${isOverdue(t.due_date, false) ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {t.due_date ? fmtDate(t.due_date) : "sem prazo"}
                  </span>
                  <Pill value={t.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <TaskDialog open={openTask !== null} onOpenChange={(o) => !o && setOpenTask(null)} task={openTask} />
    </>
  );
}

/** Linha do tempo: campanhas que tocam a janela de 15 dias atrás até 45 dias à frente, com o dia de hoje marcado. */
function CampaignTimeline({ campaigns, today }: { campaigns: CampaignRow[]; today: string }) {
  const from = format(addDays(parseISO(today), -15), "yyyy-MM-dd");
  const to = format(addDays(parseISO(today), 45), "yyyy-MM-dd");
  const span = 61;
  const pos = (d: string) => Math.max(0, Math.min(100, ((parseISO(d).getTime() - parseISO(from).getTime()) / 86_400_000 / span) * 100));
  const rows = campaigns
    .filter((c) => c.start_date && (c.end_date ?? c.start_date) >= from && c.start_date <= to)
    .map((c) => ({ c, ph: campaignPhase(c, today) }))
    .filter((x) => x.ph.key !== "parada")
    .sort((a, b) => (a.c.start_date ?? "").localeCompare(b.c.start_date ?? ""))
    .slice(0, 10);
  const months: { label: string; left: number }[] = [];
  for (let d = parseISO(from); d <= parseISO(to); d = addDays(d, 1)) {
    if (d.getDate() === 1) months.push({ label: format(d, "MMMM", { locale: ptBR }), left: pos(format(d, "yyyy-MM-dd")) });
  }
  const todayLeft = pos(today);

  return (
    <Panel
      title="Campanhas nas próximas semanas"
      className="mb-6"
      actions={
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3.5 rounded bg-primary" />No ar</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3.5 rounded bg-[#b7c9c6] dark:bg-white/25" />Programada</span>
          <span className="hidden items-center gap-1.5 sm:flex"><span className="h-2 w-3.5 rounded bg-brand-purple" />Concluída</span>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma campanha com datas neste período.</p>
      ) : (
        <div className="grid grid-cols-[minmax(110px,38%)_1fr] items-center gap-x-4 gap-y-2.5 text-[13px] sm:grid-cols-[260px_1fr]">
          <span />
          <div className="relative h-5 border-b border-border text-[11px] capitalize text-muted-foreground">
            {months.map((m) => (
              <span key={m.label} className="absolute top-0" style={{ left: `${m.left}%` }}>
                {m.label}
              </span>
            ))}
          </div>
          {rows.map(({ c, ph }) => {
            const l = pos(c.start_date!);
            const r = pos(c.end_date ?? c.start_date!);
            const color = ph.key === "no_ar" ? "bg-primary" : ph.key === "concluida" ? "bg-brand-purple/70" : "bg-[#b7c9c6] dark:bg-white/25";
            return (
              <div key={c.id} className="contents">
                <Link to="/campanhas/$id" params={{ id: c.id }} className="truncate font-medium hover:text-primary-ink" title={c.name}>
                  {c.name}
                </Link>
                <Link to="/campanhas/$id" params={{ id: c.id }} className="relative block h-5" title={`${c.name}: ${ph.label}${ph.detail ? `, ${ph.detail}` : ""}`}>
                  <span className={`absolute top-1 h-3 rounded-full ${color}`} style={{ left: `${l}%`, width: `${Math.max(1.5, r - l)}%` }} />
                  <span className="absolute -bottom-1 -top-1 w-0.5 bg-brand-dark dark:bg-white/70" style={{ left: `${todayLeft}%` }} />
                </Link>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">A linha escura marca hoje. A situação de cada campanha vem das datas de início e fim.</p>
    </Panel>
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
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary-ink">
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

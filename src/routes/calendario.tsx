import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Flag, ListTodo, Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { EventDialog } from "@/components/ops/event-dialog";
import { TaskDialog } from "@/components/ops/task-dialog";
import type { CalendarEventRow, TaskRow } from "@/integrations/supabase/types";
import { campaignPhase, DOT, EVENT_CATEGORIES, fmtDate, todayISO, useCampaigns, useEvents, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";
import { useContracts, useMktEvents, useOfflineMedia } from "@/lib/relacionamento";

/** Marco de outro módulo (evento, vencimento de contrato, instalação/retirada de mídia). */
type Milestone = { key: string; date: string; title: string; kind: string; go: () => void };

export const Route = createFileRoute("/calendario")({
  head: () => ({ meta: [{ title: "Calendário — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="calendario">
      <CalendarPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function CalendarPage() {
  const { can, profile } = usePermissions();
  const { data: profiles } = useProfiles();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState<"mes" | "lista">("mes");
  const [category, setCategory] = useState(ALL);
  const [onlyMine, setOnlyMine] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [showCampaigns, setShowCampaigns] = useState(true);
  const nav = useNavigate();
  const [openEvent, setOpenEvent] = useState<CalendarEventRow | { date: string } | null>(null);
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const from = view === "mes" ? iso(gridStart) : todayISO();
  const to = view === "mes" ? iso(gridEnd) : iso(addDays(new Date(), 60));

  const { data: events = [] } = useEvents({ from, to });
  const { data: allTasks = [] } = useTasks();
  const canSeeTasks = can("kanban", "view");
  const { data: mktEvents = [] } = useMktEvents();
  const { data: contracts = [] } = useContracts();
  const { data: media = [] } = useOfflineMedia();
  const anyMilestoneModule = can("eventos", "view") || can("contratos", "view") || can("midia", "view");

  const milestones = useMemo<Milestone[]>(() => {
    if (!showMilestones || category !== ALL || onlyMine) return [];
    const out: Milestone[] = [];
    const inRange = (d: string | null): d is string => !!d && d >= from && d <= to;
    for (const e of mktEvents) {
      if (inRange(e.event_date) && e.status !== "Cancelado") {
        out.push({ key: `ev-${e.id}`, date: e.event_date, title: e.name, kind: "Evento", go: () => void nav({ to: "/eventos/$id", params: { id: e.id } }) });
      }
    }
    for (const c of contracts) {
      if (inRange(c.end_date) && !["Encerrado", "Cancelado"].includes(c.status)) {
        out.push({ key: `ct-${c.id}`, date: c.end_date, title: c.object, kind: "Contrato vence", go: () => void nav({ to: "/contratos/$id", params: { id: c.id } }) });
      }
    }
    for (const m of media) {
      if (m.status === "Cancelado") continue;
      const open = () => void nav({ to: "/midia-offline", search: { id: m.id } });
      if (inRange(m.install_date) && m.status !== "Retirado") out.push({ key: `mi-${m.id}`, date: m.install_date, title: m.title, kind: "Instalação", go: open });
      if (inRange(m.removal_date) && m.status !== "Retirado") out.push({ key: `mr-${m.id}`, date: m.removal_date, title: m.title, kind: "Retirada", go: open });
    }
    return out;
  }, [showMilestones, category, onlyMine, mktEvents, contracts, media, from, to, nav]);

  const mine = (e: { assignee_id: string | null; participant_ids?: string[] }) =>
    e.assignee_id === profile?.id || (e.participant_ids ?? []).includes(profile?.id ?? "");

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (category === ALL || e.category === category) &&
          (!onlyMine || mine(e)) &&
          // Com as faixas de campanha ligadas, os marcos "Início —" / "Término —" do app antigo seriam repetidos
          !(showCampaigns && can("campanhas", "view") && e.category === "Campanha" && /^(Início|Término) — /.test(e.title)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, category, onlyMine, profile?.id, showCampaigns],
  );

  const deadlines = useMemo(
    () =>
      showTasks && canSeeTasks && category === ALL
        ? allTasks.filter(
            (t) =>
              t.due_date &&
              t.due_date >= from &&
              t.due_date <= to &&
              !["Concluído", "Cancelado"].includes(t.status) &&
              (!onlyMine || t.assignee_id === profile?.id),
          )
        : [],
    [allTasks, showTasks, canSeeTasks, category, from, to, onlyMine, profile?.id],
  );

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const today = todayISO();

  // Campanhas como faixas ao longo do período (até 3 por semana, as demais ficam na tela de campanhas)
  const canSeeCampaigns = can("campanhas", "view");
  const { data: campaigns = [] } = useCampaigns();
  const campaignBars = useMemo(
    () =>
      showCampaigns && canSeeCampaigns && (category === ALL || category === "Campanha")
        ? campaigns
            .filter((c) => c.start_date && (c.end_date ?? c.start_date) >= from && c.start_date <= to)
            .filter((c) => !onlyMine || c.owner_id === profile?.id)
            .map((c) => ({ c, ph: campaignPhase(c, today) }))
            .filter((x) => x.ph.key !== "parada")
            .sort((a, b) => (a.c.start_date ?? "").localeCompare(b.c.start_date ?? ""))
        : [],
    [showCampaigns, canSeeCampaigns, category, campaigns, from, to, onlyMine, profile?.id, today],
  );
  const weekBars = (week: Date[]) => {
    const ws = iso(week[0]);
    const we = iso(week[6]);
    const lanes: string[][] = [];
    const out: { id: string; name: string; col: number; span: number; lane: number; tone: string; startsHere: boolean; endsHere: boolean; title: string }[] = [];
    for (const { c, ph } of campaignBars) {
      const s0 = c.start_date!;
      const e0 = c.end_date ?? c.start_date!;
      if (e0 < ws || s0 > we) continue;
      const s1 = s0 < ws ? ws : s0;
      const e1 = e0 > we ? we : e0;
      const col = week.findIndex((d) => iso(d) === s1);
      const end = week.findIndex((d) => iso(d) === e1);
      let lane = lanes.findIndex((l) => l.every((x) => x < s1));
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(e1);
      if (lane > 2) continue;
      out.push({
        id: c.id,
        name: c.name,
        col,
        span: end - col + 1,
        lane,
        tone: ph.key === "no_ar" ? "bg-primary text-primary-foreground" : ph.key === "concluida" ? "bg-brand-purple/80 text-white" : "bg-[#d5e1de] text-[#2f4448] dark:bg-white/20 dark:text-white",
        startsHere: s0 >= ws,
        endsHere: e0 <= we,
        title: `${c.name} · ${fmtDate(c.start_date)} → ${fmtDate(c.end_date)} · ${ph.label}`,
      });
    }
    return { bars: out, lanes: Math.min(3, lanes.length) };
  };

  return (
    <>
      <PageHeader
        title="Calendário"
        description="Agenda da equipe com campanhas em faixas pelo período, compromissos, prazos de tarefas e marcos de contratos, eventos e mídia."
        actions={
          <Can module="calendario" action="create">
            <Button onClick={() => setOpenEvent({ date: today })}>
              <Plus className="h-4 w-4" /> Novo compromisso
            </Button>
          </Can>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          {view === "mes" && (
            <>
              <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCursor((c) => addMonths(c, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCursor((c) => addMonths(c, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
                Hoje
              </Button>
              <h2 className="ml-2 whitespace-nowrap font-display text-lg font-bold first-letter:uppercase">{format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
            </>
          )}
          {view === "lista" && <h2 className="font-display text-lg font-semibold">Próximos 60 dias</h2>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as "mes" | "lista")}>
            <TabsList>
              <TabsTrigger value="mes">Mês</TabsTrigger>
              <TabsTrigger value="lista">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {EVENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
            <Label htmlFor="mine" className="text-sm">Só os meus</Label>
          </div>
          {canSeeCampaigns && (
            <div className="flex items-center gap-2">
              <Switch id="campaigns" checked={showCampaigns} onCheckedChange={setShowCampaigns} />
              <Label htmlFor="campaigns" className="text-sm">Campanhas</Label>
            </div>
          )}
          {canSeeTasks && (
            <div className="flex items-center gap-2">
              <Switch id="tasks" checked={showTasks} onCheckedChange={setShowTasks} />
              <Label htmlFor="tasks" className="text-sm">Prazos de tarefas</Label>
            </div>
          )}
          {anyMilestoneModule && (
            <div className="flex items-center gap-2">
              <Switch id="milestones" checked={showMilestones} onCheckedChange={setShowMilestones} />
              <Label htmlFor="milestones" className="text-sm">Eventos, contratos e mídia</Label>
            </div>
          )}
        </div>
      </div>

      {view === "mes" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7">
              {WEEKDAYS.map((w) => (
                <div key={w} className="border-b border-border px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            {weeks.map((week) => {
              const { bars, lanes } = weekBars(week);
              const barSpace = lanes * 22;
              return (
                <div key={iso(week[0])} className="relative grid grid-cols-7 border-b border-border last:border-b-0">
                  {week.map((day) => {
                    const key = iso(day);
                    const dayEvents = filteredEvents.filter((e) => e.event_date === key);
                    const dayTasks = deadlines.filter((t) => t.due_date === key);
                    const dayMarks = milestones.filter((m) => m.date === key);
                    const items = dayEvents.length + dayTasks.length + dayMarks.length;
                    const inMonth = isSameMonth(day, cursor);
                    return (
                      <div key={key} className={`group min-h-[124px] border-r border-border p-1.5 last:border-r-0 ${inMonth ? "" : "bg-muted/40"}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] tabular-nums ${
                              key === today ? "bg-primary font-bold text-primary-foreground" : inMonth ? "font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {format(day, "d")}
                          </span>
                          {can("calendario", "create") && (
                            <button
                              type="button"
                              aria-label={`Novo compromisso em ${fmtDate(key)}`}
                              onClick={() => setOpenEvent({ date: key })}
                              className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-0.5" style={{ paddingTop: barSpace }}>
                          {dayEvents.slice(0, 3).map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setOpenEvent(e)}
                              title={e.title}
                              className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-muted ${
                                e.status === "Cancelado" ? "text-muted-foreground line-through" : ""
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[e.category] ?? "bg-muted-foreground"}`} />
                              {e.start_time && <span className="tabular-nums text-muted-foreground">{e.start_time.slice(0, 5)}</span>}
                              <span className="truncate">{e.title}</span>
                            </button>
                          ))}
                          {dayTasks.slice(0, Math.max(0, 3 - dayEvents.length)).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setOpenTask(t)}
                              title={`Prazo: ${t.title}`}
                              className="flex w-full items-center gap-1 rounded border border-dashed border-border px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted"
                            >
                              <ListTodo className="h-3 w-3 shrink-0" />
                              <span className="truncate">{t.title}</span>
                            </button>
                          ))}
                          {dayMarks.slice(0, Math.max(0, 3 - dayEvents.length - dayTasks.length)).map((m) => (
                            <button
                              key={m.key}
                              type="button"
                              onClick={m.go}
                              title={`${m.kind}: ${m.title}`}
                              className="flex w-full items-center gap-1 rounded bg-amber-500/10 px-1 py-0.5 text-left text-xs text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                            >
                              <Flag className="h-3 w-3 shrink-0" />
                              <span className="truncate">{m.title}</span>
                            </button>
                          ))}
                          {items > 3 && (
                            <button type="button" onClick={() => setView("lista")} className="px-1 text-xs font-medium text-primary-ink hover:underline">
                              +{items - 3} mais
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {bars.length > 0 && (
                    <div className="pointer-events-none absolute inset-x-0 top-10 grid grid-cols-7 gap-y-1 px-1" style={{ gridAutoRows: "18px" }}>
                      {bars.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          title={b.title}
                          onClick={() => void nav({ to: "/campanhas/$id", params: { id: b.id } })}
                          className={`pointer-events-auto mx-0.5 truncate px-2 text-left text-[11px] font-semibold leading-[18px] ${b.tone} ${b.startsHere ? "rounded-l-full" : ""} ${b.endsHere ? "rounded-r-full" : ""}`}
                          style={{ gridColumn: `${b.col + 1} / span ${b.span}`, gridRow: b.lane + 1 }}
                        >
                          {b.startsHere || b.col === 0 ? b.name : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <AgendaList
          events={filteredEvents}
          tasks={deadlines}
          milestones={milestones}
          onEvent={setOpenEvent}
          onTask={setOpenTask}
          who={(id) => (id ? profileName(profiles, id) : "Sem responsável")}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {EVENT_CATEGORIES.map((c) => (
          <span key={c} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${DOT[c]}`} />
            {c}
          </span>
        ))}
      </div>

      <EventDialog
        open={openEvent !== null}
        onOpenChange={(o) => !o && setOpenEvent(null)}
        event={openEvent && "id" in openEvent ? openEvent : null}
        defaults={openEvent && !("id" in openEvent) ? { event_date: openEvent.date } : undefined}
      />
      <TaskDialog open={openTask !== null} onOpenChange={(o) => !o && setOpenTask(null)} task={openTask} />
    </>
  );
}

function AgendaList({
  events,
  tasks,
  milestones,
  onEvent,
  onTask,
  who,
}: {
  events: CalendarEventRow[];
  tasks: TaskRow[];
  milestones: Milestone[];
  onEvent: (e: CalendarEventRow) => void;
  onTask: (t: TaskRow) => void;
  who: (id: string | null) => string;
}) {
  type Item =
    | { date: string; time: string; kind: "event"; e: CalendarEventRow }
    | { date: string; time: string; kind: "task"; t: TaskRow }
    | { date: string; time: string; kind: "mark"; m: Milestone };
  const items: Item[] = [
    ...events.map((e) => ({ date: e.event_date, time: e.start_time ?? "", kind: "event" as const, e })),
    ...tasks.map((t) => ({ date: t.due_date!, time: "99", kind: "task" as const, t })),
    ...milestones.map((m) => ({ date: m.date, time: "00", kind: "mark" as const, m })),
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">Nada agendado neste período.</p>;
  }

  const groups = new Map<string, Item[]>();
  for (const it of items) groups.set(it.date, [...(groups.get(it.date) ?? []), it]);

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([date, list]) => (
        <section key={date} className="rounded-2xl border border-border bg-card">
          <h3 className="border-b border-border px-4 py-2 text-sm font-semibold capitalize">
            {format(new Date(`${date}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h3>
          <ul className="divide-y divide-border">
            {list.map((it) =>
              it.kind === "event" ? (
                <li key={it.e.id}>
                  <button type="button" onClick={() => onEvent(it.e)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
                    <span className="w-12 text-sm tabular-nums text-muted-foreground">{it.e.start_time?.slice(0, 5) ?? "—"}</span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[it.e.category] ?? "bg-muted-foreground"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{it.e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {it.e.category} · {who(it.e.assignee_id)}
                      </span>
                    </span>
                    <Pill value={it.e.status} />
                  </button>
                </li>
              ) : it.kind === "mark" ? (
                <li key={it.m.key}>
                  <button type="button" onClick={it.m.go} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
                    <span className="w-12 text-xs text-amber-600 dark:text-amber-300">marco</span>
                    <Flag className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{it.m.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{it.m.kind}</span>
                    </span>
                  </button>
                </li>
              ) : (
                <li key={it.t.id}>
                  <button type="button" onClick={() => onTask(it.t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
                    <span className="w-12 text-xs text-muted-foreground">prazo</span>
                    <ListTodo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{it.t.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">Tarefa · {who(it.t.assignee_id)}</span>
                    </span>
                    <Pill value={it.t.status} />
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

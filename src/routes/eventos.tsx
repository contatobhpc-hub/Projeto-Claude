import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarHeart, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { EmptyState } from "@/components/ops/record-panels";
import { MktEventDialog } from "@/components/ops/rel-dialogs";
import { brl, fmtDate, todayISO } from "@/lib/operacao";
import { EVENT_TYPES, MKT_EVENT_STATUSES, daysUntil, useMktEvents } from "@/lib/relacionamento";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/eventos")({
  head: () => ({ meta: [{ title: "Eventos — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="eventos">
      <EventsPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";

function EventsPage() {
  const { data: events = [], isLoading } = useMktEvents();
  const { data: profiles } = useProfiles();
  const [when, setWhen] = useState<"proximos" | "passados" | "todos">("proximos");
  const [q, setQ] = useState("");
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const today = todayISO();

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = events.filter(
      (e) =>
        (when === "todos" || (when === "proximos" ? !e.event_date || (e.end_date ?? e.event_date) >= today : !!e.event_date && (e.end_date ?? e.event_date) < today)) &&
        (type === ALL || e.type === type) &&
        (status === ALL || e.status === status) &&
        (!t || `${e.name} ${e.city} ${e.venue}`.toLowerCase().includes(t)),
    );
    return when === "passados" ? [...list].reverse() : list;
  }, [events, q, type, status, when, today]);

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Assembleias, feiras, lançamentos e ações externas, com checklist, cronograma, convidados, fornecedores e brindes."
        actions={
          <Can module="eventos" action="create">
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo evento</Button>
          </Can>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <Tabs value={when} onValueChange={(v) => setWhen(v as typeof when)}>
          <TabsList>
            <TabsTrigger value="proximos">Próximos</TabsTrigger>
            <TabsTrigger value="passados">Realizados</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, cidade ou local" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {EVENT_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {MKT_EVENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarHeart} title={events.length ? "Nenhum evento com esses filtros" : "Nenhum evento cadastrado"} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => {
            const d = daysUntil(e.event_date);
            return (
              <Link key={e.id} to="/eventos/$id" params={{ id: e.id }} className="flex gap-4 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="text-lg font-semibold leading-none tabular-nums">{e.event_date ? e.event_date.slice(8, 10) : "—"}</span>
                  <span className="text-[10px] uppercase">{e.event_date ? fmtDate(e.event_date).slice(3) : "sem data"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{[e.type, e.city, e.venue].filter(Boolean).join(" · ")}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill value={e.status} />
                    {d !== null && d >= 0 && d <= 30 && !["Concluído", "Cancelado"].includes(e.status) && (
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-300">{d === 0 ? "hoje" : `em ${d} dia${d === 1 ? "" : "s"}`}</span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {e.assignee_id ? profileName(profiles, e.assignee_id) : "Sem responsável"}
                    {e.budget > 0 && ` · ${brl(Number(e.budget))}`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <MktEventDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

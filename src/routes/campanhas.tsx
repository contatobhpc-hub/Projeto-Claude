import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Columns3, List, Megaphone, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ops/fields";
import { EmptyState } from "@/components/ops/record-panels";
import { CampaignDialog } from "@/components/ops/campaign-dialog";
import type { CampaignRow } from "@/integrations/supabase/types";
import { brl, CAMPAIGN_TYPES, campaignPhase, fmtDate, todayISO, useCampaigns, type CampaignPhase, type CampaignPhaseKey } from "@/lib/operacao";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="campanhas">
      <CampaignsPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
type View = "lista" | "linha" | "quadro";
type Item = { c: CampaignRow; ph: CampaignPhase };

const PHASE_FILTERS: { key: CampaignPhaseKey | "todas"; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "no_ar", label: "No ar" },
  { key: "programada", label: "Programadas" },
  { key: "concluida", label: "Concluídas" },
  { key: "parada", label: "Pausadas ou canceladas" },
  { key: "sem_datas", label: "Sem datas" },
];

/** Ordem natural: no ar (termina antes primeiro), programadas (começa antes), concluídas (mais recentes). */
const ORDER: Record<CampaignPhaseKey, number> = { no_ar: 0, programada: 1, sem_datas: 2, concluida: 3, parada: 4 };
function sortItems(a: Item, b: Item) {
  if (ORDER[a.ph.key] !== ORDER[b.ph.key]) return ORDER[a.ph.key] - ORDER[b.ph.key];
  if (a.ph.key === "no_ar") return (a.c.end_date ?? "").localeCompare(b.c.end_date ?? "");
  if (a.ph.key === "concluida") return (b.c.end_date ?? "").localeCompare(a.c.end_date ?? "");
  return (a.c.start_date ?? "9999").localeCompare(b.c.start_date ?? "9999");
}

function readView(): View {
  try {
    const v = window.localStorage.getItem("mhub.campaigns.view");
    return v === "linha" || v === "quadro" ? v : "lista";
  } catch {
    return "lista";
  }
}

function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: profiles } = useProfiles();
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<CampaignPhaseKey | "todas">("todas");
  const [type, setType] = useState(ALL);
  const [view, setView] = useState<View>("lista");
  const [creating, setCreating] = useState(false);
  const today = todayISO();

  useEffect(() => setView(readView()), []);
  const changeView = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem("mhub.campaigns.view", v);
    } catch {
      // preferência só deste navegador; sem ela, volta para a lista
    }
  };

  const all = useMemo(() => campaigns.map<Item>((c) => ({ c, ph: campaignPhase(c, today) })), [campaigns, today]);
  const counts = useMemo(() => {
    const m: Record<string, number> = { todas: all.length };
    for (const x of all) m[x.ph.key] = (m[x.ph.key] ?? 0) + 1;
    return m;
  }, [all]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter(
        ({ c, ph }) =>
          (phase === "todas" || ph.key === phase) &&
          (type === ALL || c.type === type) &&
          (!term || c.name.toLowerCase().includes(term) || c.products.some((p) => p.toLowerCase().includes(term))),
      )
      .sort(sortItems);
  }, [all, q, phase, type]);

  const live = counts.no_ar ?? 0;
  const soon = all.filter((x) => x.ph.key === "programada" && x.c.start_date && x.c.start_date <= addDaysISO(today, 14)).length;

  return (
    <>
      <PageHeader
        title="Campanhas"
        description={
          isLoading
            ? "Carregando campanhas…"
            : `${all.length} campanha${all.length === 1 ? "" : "s"} · ${live} no ar agora${soon ? ` · ${soon} começa${soon > 1 ? "m" : ""} nas próximas 2 semanas` : ""}. A situação vem das datas de início e fim.`
        }
        actions={
          <Can module="campanhas" action="create">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nova campanha
            </Button>
          </Can>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div role="group" aria-label="Modo de exibição" className="flex w-fit gap-1 rounded-xl bg-secondary p-1">
          {(
            [
              { v: "lista", label: "Lista", icon: List },
              { v: "linha", label: "Linha do tempo", icon: CalendarRange },
              { v: "quadro", label: "Quadro", icon: Columns3 },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={view === o.v}
              onClick={() => changeView(o.v)}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                view === o.v ? "bg-card text-foreground shadow-[var(--shadow-xs)]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <o.icon className="h-4 w-4" /> <span className={o.v === "lista" ? "" : "hidden sm:inline"}>{o.label}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder="Buscar por nome ou produto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-11 lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {CAMPAIGN_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        {PHASE_FILTERS.filter((f) => f.key === "todas" || counts[f.key]).map((f) => {
          const on = phase === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setPhase(f.key)}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                on ? "border-brand-dark bg-brand-dark text-white dark:border-primary dark:bg-primary dark:text-primary-foreground" : "border-input bg-card hover:border-border-strong"
              }`}
            >
              {f.label} <span className={on ? "opacity-80" : "text-muted-foreground"}>· {counts[f.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title="Nenhuma campanha ainda" desc="Crie a primeira campanha para organizar projetos, tarefas e conteúdos." />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">Nenhuma campanha com esses filtros.</p>
      ) : view === "linha" ? (
        <TimelineView items={items} today={today} />
      ) : view === "quadro" ? (
        <BoardView items={items} />
      ) : (
        <ListView items={items} profiles={profiles} />
      )}

      <CampaignDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Situação com o detalhe de tempo, sempre com nome escrito (a cor só ajuda). */
function PhaseBadge({ ph }: { ph: CampaignPhase }) {
  const endingSoon = ph.key === "no_ar" && ph.totalDays - ph.day <= 5;
  return (
    <div className="flex flex-col items-start gap-1">
      <Pill value={ph.label} />
      {ph.detail && <span className={`text-xs ${endingSoon ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{ph.detail}</span>}
    </div>
  );
}

function Progress({ ph }: { ph: CampaignPhase }) {
  if (!ph.totalDays) return null;
  return (
    <div className="mt-1.5 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-secondary">
      <div className={`h-full rounded-full ${ph.key === "concluida" ? "bg-brand-purple/70" : "bg-primary"}`} style={{ width: `${ph.progress}%` }} />
    </div>
  );
}

function ListView({ items, profiles }: { items: Item[]; profiles: ReturnType<typeof useProfiles>["data"] }) {
  return (
    <>
      {/* Computador: tabela */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Campanha</th>
              <th className="px-3 py-3">Situação</th>
              <th className="w-[240px] px-3 py-3">Período</th>
              <th className="px-3 py-3">Responsável</th>
              <th className="px-5 py-3 text-right">Orçamento</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ c, ph }) => (
              <tr key={c.id} className="border-b border-border/70 last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3.5">
                  <Link to="/campanhas/$id" params={{ id: c.id }} className="font-semibold hover:text-primary-ink">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {c.type} · {c.objective} · prioridade {c.priority.toLowerCase()}
                    {c.approval_status === "Aguardando" && <span className="ml-1 font-medium text-amber-700 dark:text-amber-300">· aguardando aprovação</span>}
                  </div>
                </td>
                <td className="px-3 py-3.5 align-top"><PhaseBadge ph={ph} /></td>
                <td className="px-3 py-3.5">
                  <div className="text-[13px] tabular-nums">{c.start_date ? `${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}` : "—"}</div>
                  <Progress ph={ph} />
                  {ph.key === "no_ar" && <div className="mt-1 text-xs text-muted-foreground">dia {ph.day} de {ph.totalDays}</div>}
                </td>
                <td className="px-3 py-3.5 text-[13px]">{c.owner_id ? profileName(profiles, c.owner_id) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-5 py-3.5 text-right text-[13px] tabular-nums">{Number(c.budget) ? brl(Number(c.budget)) : <span className="text-muted-foreground">a definir</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: cartões */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {items.map(({ c, ph }) => (
          <li key={c.id}>
            <Link to="/campanhas/$id" params={{ id: c.id }} className="block rounded-2xl border border-border bg-card p-4 active:bg-muted">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold leading-snug">{c.name}</span>
                <Pill value={ph.label} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.start_date ? `${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}` : "sem datas"}
                {ph.detail ? ` · ${ph.detail}` : ""}
              </div>
              <Progress ph={ph} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Linha do tempo do ano das campanhas filtradas, com hoje marcado. */
function TimelineView({ items, today }: { items: Item[]; today: string }) {
  const dated = items.filter((x) => x.c.start_date).sort((a, b) => (a.c.start_date ?? "").localeCompare(b.c.start_date ?? ""));
  const years = dated.map((x) => Number(x.c.start_date!.slice(0, 4)));
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(years.includes(thisYear) || years.length === 0 ? thisYear : years[years.length - 1]);
  const start = Date.parse(`${year}-01-01T12:00:00`);
  const end = Date.parse(`${year + 1}-01-01T12:00:00`);
  const pos = (iso: string) => Math.max(0, Math.min(100, ((Date.parse(`${iso}T12:00:00`) - start) / (end - start)) * 100));
  const rows = dated.filter((x) => (x.c.end_date ?? x.c.start_date!) >= `${year}-01-01` && x.c.start_date! <= `${year}-12-31`);
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const todayIn = today.startsWith(String(year));
  const yearsAvail = [...new Set([...years, thisYear])].sort();

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {yearsAvail.map((y) => (
            <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)} className={`h-8 rounded-lg px-3 text-[13px] font-medium ${y === year ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {y}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{rows.length} campanha{rows.length === 1 ? "" : "s"} em {year}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha com datas em {year}.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[220px_1fr] items-center gap-x-4 gap-y-2 text-[13px]">
            <span />
            <div className="grid grid-cols-12 border-b border-border pb-1.5 text-[11px] uppercase text-muted-foreground">
              {months.map((m) => <span key={m}>{m}</span>)}
            </div>
            {rows.map(({ c, ph }) => {
              const l = pos(c.start_date!);
              const r = pos(c.end_date ?? c.start_date!);
              const color = ph.key === "no_ar" ? "bg-primary" : ph.key === "concluida" ? "bg-brand-purple/70" : ph.key === "parada" ? "bg-muted-foreground/40" : "bg-[#b7c9c6] dark:bg-white/25";
              return (
                <div key={c.id} className="contents">
                  <Link to="/campanhas/$id" params={{ id: c.id }} className="truncate font-medium hover:text-primary-ink" title={c.name}>
                    {c.name}
                  </Link>
                  <Link to="/campanhas/$id" params={{ id: c.id }} className="relative block h-6" title={`${c.name} · ${fmtDate(c.start_date)} → ${fmtDate(c.end_date)} · ${ph.label}`}>
                    <span className="absolute inset-y-0 left-0 right-0 grid grid-cols-12">
                      {months.map((m) => <span key={m} className="border-l border-border/50 first:border-0" />)}
                    </span>
                    <span className={`absolute top-1.5 h-3 rounded-full ${color}`} style={{ left: `${l}%`, width: `${Math.max(0.8, r - l)}%` }} />
                    {todayIn && <span className="absolute -bottom-1 -top-1 w-0.5 bg-brand-dark dark:bg-white/70" style={{ left: `${pos(today)}%` }} />}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Quadro por situação. */
function BoardView({ items }: { items: Item[] }) {
  const cols: { key: CampaignPhaseKey; title: string }[] = [
    { key: "programada", title: "Programadas" },
    { key: "no_ar", title: "No ar" },
    { key: "concluida", title: "Concluídas" },
    { key: "parada", title: "Pausadas ou canceladas" },
  ];
  const noDates = items.filter((x) => x.ph.key === "sem_datas");
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {[...cols, ...(noDates.length ? [{ key: "sem_datas" as const, title: "Sem datas" }] : [])].map((col) => {
        const list = items.filter((x) => x.ph.key === col.key);
        return (
          <section key={col.key} className="flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col rounded-2xl bg-secondary/70 p-2.5 sm:w-auto sm:min-w-[260px] sm:flex-1">
            <h2 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {col.title} <span className="rounded-full bg-card px-2 text-foreground">{list.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {list.length === 0 && <p className="px-1.5 py-3 text-xs text-muted-foreground">Nada aqui.</p>}
              {list.map(({ c, ph }) => (
                <Link key={c.id} to="/campanhas/$id" params={{ id: c.id }} className="block rounded-xl border border-border bg-card p-3 hover:border-border-strong">
                  <div className="text-[13.5px] font-semibold leading-snug">{c.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.start_date ? `${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}` : c.type}
                  </div>
                  {ph.detail && <div className="mt-1 text-xs font-medium text-primary-ink">{ph.detail}</div>}
                  <Progress ph={ph} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

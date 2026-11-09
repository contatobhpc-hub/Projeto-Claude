import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileSpreadsheet, Plus, Search, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/ops/fields";
import { EmptyState, Panel } from "@/components/ops/record-panels";
import { SponsorshipDialog } from "@/components/ops/materials-dialogs";
import { SponsorshipImport } from "@/components/ops/sponsorship-import";
import { AlertPill } from "@/components/ops/rel-fields";
import { brl, fmtDate } from "@/lib/operacao";
import {
  ALERT_TONE,
  nextSponsorshipDeadline,
  SPONSORSHIP_CATEGORIES,
  SPONSORSHIP_STATUSES,
  useSponsorshipBudget,
  useSponsorships,
} from "@/lib/relacionamento";

export const Route = createFileRoute("/patrocinios")({
  head: () => ({ meta: [{ title: "Patrocínios — Marketing Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
  component: () => (
    <ModuleGuard module="patrocinios">
      <SponsorshipsPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const NEW = "new";

function SponsorshipsPage() {
  const nav = useNavigate({ from: "/patrocinios" });
  const { id: openId } = Route.useSearch();
  const { data: list = [], isLoading } = useSponsorships();
  const budgets = useSponsorshipBudget();
  const thisYear = String(new Date().getFullYear());
  const years = useMemo(() => {
    const set = new Set<string>([thisYear, ...Object.keys(budgets)]);
    for (const s of list) if (s.start_date) set.add(s.start_date.slice(0, 4));
    return [...set].sort().reverse();
  }, [list, budgets, thisYear]);
  const [year, setYear] = useState(thisYear);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [importing, setImporting] = useState(false);

  // Sem data entra no ano corrente, para não sumir da lista
  const ofYear = list.filter((s) => (s.start_date ?? thisYear).startsWith(year));
  const committed = ofYear.filter((s) => s.status !== "Cancelado").reduce((t, s) => t + Number(s.value || 0), 0);
  const done = ofYear.filter((s) => s.status === "Concluído").reduce((t, s) => t + Number(s.value || 0), 0);
  const budget = budgets[year] ?? 0;
  const pct = budget ? Math.min(100, Math.round((committed / budget) * 100)) : 0;

  const byCategory = SPONSORSHIP_CATEGORIES.map((c) => ({
    c,
    v: ofYear.filter((s) => s.category === c && s.status !== "Cancelado").reduce((t, s) => t + Number(s.value || 0), 0),
    n: ofYear.filter((s) => s.category === c && s.status !== "Cancelado").length,
  }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.v - a.v);
  const maxCat = Math.max(1, ...byCategory.map((x) => x.v));

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ofYear.filter(
      (s) =>
        (status === ALL || s.status === status) &&
        (category === ALL || s.category === category) &&
        (!t || `${s.event_name} ${s.institution} ${s.city}`.toLowerCase().includes(t)),
    );
  }, [ofYear, q, status, category]);

  const setOpen = (id: string | undefined) => void nav({ search: id ? { id } : {}, replace: true });
  const selected = openId && openId !== NEW ? list.find((s) => s.id === openId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Patrocínios"
        description="Patrocínios concedidos, verba do ano, contrapartidas e prazos de prestação de contas."
        actions={
          <div className="flex gap-2">
            <Can module="patrocinios" action="create">
              <Button variant="outline" onClick={() => setImporting(true)}><FileSpreadsheet className="h-4 w-4" /> Importar planilha</Button>
              <Button onClick={() => setOpen(NEW)}><Plus className="h-4 w-4" /> Novo patrocínio</Button>
            </Can>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Panel
          title={`Verba ${year}`}
          className="lg:col-span-2"
          actions={
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Verba do ano" value={budget ? brl(budget) : "não definida"} />
            <Figure label="Comprometido" value={brl(committed)} />
            <Figure label="Já realizado" value={brl(done)} />
            <Figure label="Saldo" value={budget ? brl(budget - committed) : "—"} tone={budget && committed > budget ? "text-red-600 dark:text-red-400" : ""} />
          </div>
          {budget > 0 && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${committed > budget ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{pct}% da verba comprometida · {ofYear.filter((s) => s.status !== "Cancelado").length} patrocínios</p>
            </div>
          )}
          {!budget && <p className="mt-3 text-xs text-muted-foreground">Um Administrador define a verba anual em Configurações.</p>}
        </Panel>
        <Panel title="Por categoria">
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada em {year}.</p>
          ) : (
            <ul className="space-y-2">
              {byCategory.map((x) => (
                <li key={x.c}>
                  <div className="flex justify-between text-xs">
                    <span>{x.c} <span className="text-muted-foreground">({x.n})</span></span>
                    <span className="tabular-nums">{brl(x.v)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(x.v / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por evento, instituição ou cidade" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {SPONSORSHIP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {SPONSORSHIP_CATEGORIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && list.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nenhum patrocínio cadastrado" desc="Cadastre um a um ou importe a planilha de controle." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
          <Table className="table-cards">
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead className="w-[120px]">Categoria</TableHead>
                <TableHead className="w-[170px]">Próximo prazo</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[110px] text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nada em {year} com esses filtros.</TableCell></TableRow>}
              {rows.map((s) => {
                const dl = nextSponsorshipDeadline(s);
                const tone = !dl ? null : dl.days < 0 ? ALERT_TONE.expired : dl.days <= 7 ? ALERT_TONE.critical : dl.days <= 30 ? ALERT_TONE.soon : ALERT_TONE.none;
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpen(s.id)}>
                    <TableCell>
                      <div className="font-medium">{s.event_name}</div>
                      <div className="text-xs text-muted-foreground">{[s.institution, s.city].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{fmtDate(s.start_date)}</TableCell>
                    <TableCell className="text-sm">{s.category} <span className="text-xs text-muted-foreground">· {s.tier}</span></TableCell>
                    <TableCell>{dl && tone ? <AlertPill tone={tone}>{dl.label}: {fmtDate(dl.date).slice(0, 5)}</AlertPill> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Pill value={s.status} /></TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{brl(Number(s.value || 0))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <SponsorshipDialog
        open={!!openId}
        onOpenChange={(o) => !o && setOpen(undefined)}
        sponsorship={selected}
        defaults={openId === NEW ? { start_date: null } : undefined}
      />
      <SponsorshipImport open={importing} onOpenChange={setImporting} />
    </>
  );
}

function Figure({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-display text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gauge, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnumSelect, Field, PersonSelect } from "@/components/ops/fields";
import { EmptyState, RecordHistory } from "@/components/ops/record-panels";
import { EntityDialog } from "@/components/ops/entity-dialog";
import { persist } from "@/components/ops/rel-dialogs";
import { supabase } from "@/integrations/supabase/client";
import type { IndicatorRow, IndicatorValueRow } from "@/integrations/supabase/types";
import { moneyInput, parseMoney } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { usePermissions } from "@/lib/permissions";
import { useIndicators, useIndicatorValues } from "@/lib/inteligencia";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/indicadores")({
  head: () => ({ meta: [{ title: "Indicadores — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="indicadores">
      <IndicatorsPage />
    </ModuleGuard>
  ),
});

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Períodos do ano conforme a frequência do indicador. */
function periodsOf(freq: string, year: number): { key: string; label: string }[] {
  if (freq === "Anual") return [{ key: `${year}-01-01`, label: String(year) }];
  if (freq === "Trimestral") return [0, 3, 6, 9].map((m, i) => ({ key: `${year}-${String(m + 1).padStart(2, "0")}-01`, label: `${i + 1}º tri` }));
  return MONTHS.map((l, i) => ({ key: `${year}-${String(i + 1).padStart(2, "0")}-01`, label: l }));
}

function IndicatorsPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data: indicators = [], isLoading } = useIndicators();
  const { data: values = [] } = useIndicatorValues();
  const { data: profiles } = useProfiles();
  const [open, setOpen] = useState<IndicatorRow | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Indicadores"
        description="Indicadores de resultado do marketing, lançados por período, com meta e evolução. Podem medir os resultados-chave do Planejamento."
        actions={
          <div className="flex gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[thisYear, thisYear - 1, thisYear - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Can module="indicadores" action="create">
              <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Novo indicador</Button>
            </Can>
          </div>
        }
      />

      {!isLoading && indicators.length === 0 ? (
        <EmptyState icon={Gauge} title="Nenhum indicador cadastrado" desc="Exemplos: novos cooperados, alcance no Instagram, leads gerados, participação em eventos." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {indicators.map((ind) => {
            const vals = values.filter((v) => v.indicator_id === ind.id && v.period.startsWith(String(year)));
            const total = vals.reduce((s, v) => s + Number(v.value), 0);
            const last = vals[vals.length - 1];
            const prev = vals[vals.length - 2];
            const shown = ind.frequency === "Mensal" ? total : Number(last?.value ?? 0);
            const target = ind.target !== null ? Number(ind.target) : null;
            const pct = target ? Math.round((shown / target) * 100) : null;
            const good = ind.direction === "up" ? (pct ?? 0) >= 100 : target !== null && shown <= target;
            const delta = last && prev ? Number(last.value) - Number(prev.value) : null;
            const series = periodsOf(ind.frequency, year).map((p) => ({ label: p.label, value: vals.find((v) => v.period === p.key)?.value ?? null }));
            return (
              <button key={ind.id} type="button" onClick={() => setOpen(ind)} className="rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{ind.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ind.frequency} · {ind.direction === "up" ? "maior é melhor" : "menor é melhor"}
                      {ind.owner_id && ` · ${profileName(profiles, ind.owner_id)}`}
                    </div>
                  </div>
                  {delta !== null && delta !== 0 && (
                    <span className={`flex items-center gap-0.5 text-xs ${(delta > 0) === (ind.direction === "up") ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {fmt(Math.abs(delta))}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-semibold tabular-nums">{vals.length ? fmt(shown) : "—"}</span>
                  <span className="text-sm text-muted-foreground">{ind.unit}</span>
                  {target !== null && <span className="ml-auto text-xs text-muted-foreground">meta {fmt(target)}{pct !== null && vals.length ? ` · ${pct}%` : ""}</span>}
                </div>
                {target !== null && vals.length > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${good ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                  </div>
                )}
                <div className="mt-3 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-[11px] text-muted-foreground">{ind.frequency === "Mensal" ? `Acumulado ${year}` : `Último valor de ${year}`}</div>
              </button>
            );
          })}
        </div>
      )}

      <IndicatorDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        indicator={open && open !== "new" ? indicators.find((i) => i.id === open.id) ?? open : null}
        values={values}
        year={year}
      />
    </>
  );
}

function IndicatorDialog({
  open,
  onOpenChange,
  indicator,
  values,
  year,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  indicator: IndicatorRow | null;
  values: IndicatorValueRow[];
  year: number;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [d, setD] = useState({ name: "", description: "", unit: "", direction: "up", frequency: "Mensal", target: "", owner_id: null as string | null });
  const [busy, setBusy] = useState(false);
  const isNew = !indicator;
  const readOnly = isNew ? !can("indicadores", "create") : !can("indicadores", "edit");

  useEffect(() => {
    if (!open) return;
    setD({
      name: indicator?.name ?? "", description: indicator?.description ?? "", unit: indicator?.unit ?? "",
      direction: indicator?.direction ?? "up", frequency: indicator?.frequency ?? "Mensal",
      target: indicator?.target !== null && indicator?.target !== undefined ? moneyInput(Number(indicator.target)) || "0" : "", owner_id: indicator?.owner_id ?? null,
    });
  }, [open, indicator]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = d.target.trim() ? parseMoney(d.target) : null;
    if (target !== null && Number.isNaN(target)) return void toast.error("Meta inválida.");
    setBusy(true);
    try {
      await persist("indicators", indicator, {
        name: d.name.trim(), description: d.description, unit: d.unit.trim(), direction: d.direction, frequency: d.frequency, target, owner_id: d.owner_id,
      });
      toast.success(isNew ? "Indicador criado. Agora lance os valores." : "Indicador salvo.");
      void qc.invalidateQueries({ queryKey: ["indicators"] });
      if (isNew) onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Novo indicador" : indicator!.name}
      formId="indicator-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      wide
      remove={indicator && can("indicadores", "delete") ? { table: "indicators", id: indicator.id, label: indicator.name } : undefined}
      tabs={
        indicator
          ? [
              { value: "valores", label: `Valores ${year}`, content: <ValuesEditor indicator={indicator} values={values} year={year} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="indicators" recordId={indicator.id} /> },
            ]
          : []
      }
      form={
        <form id="indicator-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome" className="sm:col-span-2"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required disabled={readOnly} autoFocus={isNew} /></Field>
          <Field label="Unidade"><Input value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} disabled={readOnly} placeholder="pessoas, %, R$" /></Field>
          <Field label="Frequência"><EnumSelect value={d.frequency} options={["Mensal", "Trimestral", "Anual"]} onChange={(v) => setD({ ...d, frequency: v })} disabled={readOnly} /></Field>
          <Field label="Sentido">
            <Select value={d.direction} onValueChange={(v) => setD({ ...d, direction: v })} disabled={readOnly}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="up">Maior é melhor</SelectItem>
                <SelectItem value="down">Menor é melhor</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Meta do ano" hint={d.frequency === "Mensal" ? "Comparada com a soma dos meses." : "Comparada com o último valor."}>
            <Input inputMode="decimal" value={d.target} onChange={(e) => setD({ ...d, target: e.target.value })} disabled={readOnly} />
          </Field>
          <Field label="Responsável" className="sm:col-span-3"><PersonSelect value={d.owner_id} onChange={(v) => setD({ ...d, owner_id: v })} disabled={readOnly} /></Field>
          <Field label="Como é medido" className="sm:col-span-3"><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} disabled={readOnly} /></Field>
        </form>
      }
    />
  );
}

function ValuesEditor({ indicator, values, year }: { indicator: IndicatorRow; values: IndicatorValueRow[]; year: number }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("indicadores", "edit") || can("indicadores", "create");
  const periods = useMemo(() => periodsOf(indicator.frequency, year), [indicator.frequency, year]);
  const mine = values.filter((v) => v.indicator_id === indicator.id);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(Object.fromEntries(periods.map((p) => [p.key, moneyInput(Number(mine.find((v) => v.period === p.key)?.value ?? 0)) || (mine.some((v) => v.period === p.key) ? "0" : "")])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator.id, year, values]);

  async function save() {
    const rows: { indicator_id: string; period: string; value: number }[] = [];
    const remove: string[] = [];
    for (const p of periods) {
      const raw = (draft[p.key] ?? "").trim();
      const existing = mine.find((v) => v.period === p.key);
      if (!raw) {
        if (existing) remove.push(existing.id);
        continue;
      }
      const n = parseMoney(raw);
      if (Number.isNaN(n)) return void toast.error(`Valor inválido em ${p.label}.`);
      rows.push({ indicator_id: indicator.id, period: p.key, value: n });
    }
    setBusy(true);
    try {
      if (rows.length) {
        const { error } = await supabase.from("indicator_values").upsert(rows, { onConflict: "indicator_id,period" });
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await supabase.from("indicator_values").delete().in("id", remove);
        if (error) throw error;
      }
      toast.success("Valores salvos.");
      void qc.invalidateQueries({ queryKey: ["indicator_values"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const chart = periods.map((p) => ({ label: p.label, value: mine.find((v) => v.period === p.key)?.value ?? null }));
  const monthlyTarget = indicator.target !== null && indicator.frequency === "Mensal" ? Number(indicator.target) / 12 : indicator.target !== null ? Number(indicator.target) : null;

  return (
    <div className="space-y-4">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={48} />
            <Tooltip formatter={(v) => [`${fmt(Number(v))} ${indicator.unit}`, indicator.name]} />
            {monthlyTarget !== null && (
              <ReferenceLine y={monthlyTarget} stroke="var(--color-primary)" strokeDasharray="4 4" label={{ value: indicator.frequency === "Mensal" ? "meta/mês" : "meta", fontSize: 10 }} />
            )}
            <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {periods.map((p) => (
          <Field key={p.key} label={p.label}>
            <Input inputMode="decimal" value={draft[p.key] ?? ""} onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })} disabled={!canEdit} />
          </Field>
        ))}
      </div>
      {canEdit && (
        <Button type="button" onClick={() => void save()} disabled={busy}>
          Salvar valores
        </Button>
      )}
    </div>
  );
}

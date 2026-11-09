import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, Stat } from "@/components/ops/record-panels";
import { exportExcel } from "@/lib/export-utils";
import { brl, useCampaigns, useContents, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { useMktEvents, useSponsorships } from "@/lib/relacionamento";
import { useExpenses } from "@/lib/financeiro";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="analytics">
      <AnalyticsPage />
    </ModuleGuard>
  ),
});

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PRIMARY = "var(--color-primary)";
const MUTED = "var(--color-muted-foreground)";
const axis = { tick: { fontSize: 11 }, stroke: MUTED } as const;

/** Barras finas com topo arredondado, uma série por cor (principal) e cinza para comparação. */
function MonthlyBars({
  data,
  series,
  money,
}: {
  data: Record<string, number | string>[];
  series: { key: string; label: string; color: string }[];
  money?: boolean;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" {...axis} tickLine={false} />
          <YAxis {...axis} width={money ? 72 : 36} tickLine={false} axisLine={false} tickFormatter={(v) => (money ? brl(Number(v)) : String(v))} />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            formatter={(v, name) => [money ? brl(Number(v)) : Number(v).toLocaleString("pt-BR"), String(name)]}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking horizontal (categorias), com valor ao lado: legível sem depender de cor. */
function Ranking({ rows, money }: { rows: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-xs">
            <span>{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{money ? brl(r.value) : r.value.toLocaleString("pt-BR")}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AnalyticsPage() {
  const { can } = usePermissions();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const y = String(year);

  const { data: tasks = [] } = useTasks();
  const { data: campaigns = [] } = useCampaigns();
  const { data: contents = [] } = useContents();
  const { data: events = [] } = useMktEvents();
  const { data: sponsorships = [] } = useSponsorships();
  const { data: expenses = [] } = useExpenses();
  const seeFinance = can("fin_orcamento", "view");

  const m = useMemo(() => {
    const month = (iso: string | null | undefined) => (iso && iso.startsWith(y) ? Number(iso.slice(5, 7)) - 1 : -1);
    const byMonth = MONTHS.map((label) => ({ label, criadas: 0, concluidas: 0, gasto: 0, eventos: 0, conteudos: 0 }));
    let onTime = 0;
    let doneWithDue = 0;
    let leadSum = 0;
    let leadN = 0;
    for (const t of tasks) {
      const c = month(t.created_at);
      if (c >= 0) byMonth[c].criadas++;
      const d = month(t.completed_at);
      if (d >= 0) {
        byMonth[d].concluidas++;
        if (t.due_date) {
          doneWithDue++;
          if (t.completed_at!.slice(0, 10) <= t.due_date) onTime++;
        }
        leadSum += (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 86_400_000;
        leadN++;
      }
    }
    for (const e of expenses) {
      const i = month(e.expense_date);
      if (i >= 0) byMonth[i].gasto += Number(e.total);
    }
    for (const e of events) {
      const i = month(e.event_date);
      if (i >= 0 && e.status !== "Cancelado") byMonth[i].eventos++;
    }
    for (const c of contents) {
      const i = month(c.created_at);
      if (i >= 0) byMonth[i].conteudos++;
    }
    const count = <T,>(list: T[], key: (x: T) => string, val: (x: T) => number = () => 1) => {
      const map = new Map<string, number>();
      for (const x of list) map.set(key(x), (map.get(key(x)) ?? 0) + val(x));
      return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const yearCampaigns = campaigns.filter((c) => (c.start_date ?? c.created_at).startsWith(y));
    const yearSponsor = sponsorships.filter((s) => (s.start_date ?? "").startsWith(y) && s.status !== "Cancelado");
    const yearExpenses = expenses.filter((e) => e.expense_date.startsWith(y));
    return {
      byMonth,
      onTimePct: doneWithDue ? Math.round((onTime / doneWithDue) * 100) : null,
      leadDays: leadN ? Math.round(leadSum / leadN) : null,
      doneTotal: byMonth.reduce((s, x) => s + x.concluidas, 0),
      spentTotal: byMonth.reduce((s, x) => s + x.gasto, 0),
      campaignsByStatus: count(yearCampaigns, (c) => c.status),
      contentsByCategory: count(contents.filter((c) => c.created_at.startsWith(y)), (c) => c.category),
      sponsorByCategory: count(yearSponsor, (s) => s.category, (s) => Number(s.value)),
      spendByBudget: count(yearExpenses, (e) => e.budget_category || "Sem categoria", (e) => Number(e.total)),
      published: contents.filter((c) => c.status === "Publicado" && c.updated_at.startsWith(y)).length,
    };
  }, [tasks, campaigns, contents, events, sponsorships, expenses, y]);

  function exportAll() {
    exportExcel(`analytics-${year}`, {
      "Por mês": m.byMonth.map((r) => ({
        Mês: r.label, "Tarefas criadas": r.criadas, "Tarefas concluídas": r.concluidas, Eventos: r.eventos, "Conteúdos criados": r.conteudos,
        ...(seeFinance ? { "Gasto realizado (R$)": Math.round(r.gasto * 100) / 100 } : {}),
      })),
      "Campanhas por status": m.campaignsByStatus.map((r) => ({ Status: r.label, Campanhas: r.value })),
      "Conteúdos por categoria": m.contentsByCategory.map((r) => ({ Categoria: r.label, Conteúdos: r.value })),
      "Patrocínios por categoria": m.sponsorByCategory.map((r) => ({ Categoria: r.label, "Valor (R$)": r.value })),
      ...(seeFinance ? { "Gasto por orçamento": m.spendByBudget.map((r) => ({ Categoria: r.label, "Valor (R$)": r.value })) } : {}),
    });
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Produção e resultados da equipe calculados a partir dos dados reais de todos os módulos."
        actions={
          <div className="flex gap-2">
            <Select value={y} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[thisYear, thisYear - 1, thisYear - 2].map((v) => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={exportAll}><Download className="h-4 w-4" /> Excel</Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tarefas concluídas" value={m.doneTotal.toLocaleString("pt-BR")} hint={m.leadDays !== null ? `em média ${m.leadDays} dia(s) da criação à entrega` : undefined} />
        <Stat label="Entregas no prazo" value={m.onTimePct === null ? "—" : `${m.onTimePct}%`} hint="das tarefas concluídas que tinham prazo" />
        <Stat label="Conteúdos publicados" value={String(m.published)} />
        {seeFinance ? <Stat label="Gasto realizado" value={brl(m.spentTotal)} /> : <Stat label="Eventos realizados" value={String(m.byMonth.reduce((s, x) => s + x.eventos, 0))} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tarefas criadas × concluídas por mês">
          <MonthlyBars
            data={m.byMonth}
            series={[
              { key: "criadas", label: "Criadas", color: MUTED },
              { key: "concluidas", label: "Concluídas", color: PRIMARY },
            ]}
          />
        </Panel>
        {seeFinance && (
          <Panel title="Gasto realizado por mês">
            <MonthlyBars data={m.byMonth} series={[{ key: "gasto", label: "Gasto", color: PRIMARY }]} money />
          </Panel>
        )}
        <Panel title="Eventos por mês">
          <MonthlyBars data={m.byMonth} series={[{ key: "eventos", label: "Eventos", color: PRIMARY }]} />
        </Panel>
        <Panel title="Conteúdos criados por mês">
          <MonthlyBars data={m.byMonth} series={[{ key: "conteudos", label: "Conteúdos", color: PRIMARY }]} />
        </Panel>
        <Panel title={`Campanhas de ${year} por status`}>
          <Ranking rows={m.campaignsByStatus} />
        </Panel>
        <Panel title="Conteúdos por categoria">
          <Ranking rows={m.contentsByCategory} />
        </Panel>
        <Panel title="Patrocínios por categoria (valor)">
          <Ranking rows={m.sponsorByCategory} money />
        </Panel>
        {seeFinance && (
          <Panel title="Gasto por categoria do orçamento">
            <Ranking rows={m.spendByBudget} money />
          </Panel>
        )}
      </div>
    </>
  );
}

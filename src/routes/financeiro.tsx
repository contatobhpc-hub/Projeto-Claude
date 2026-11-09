import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Download, Plus, Search, Wallet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { EmptyState, Panel, Stat } from "@/components/ops/record-panels";
import {
  BudgetLineDialog,
  CostCenterDialog,
  ExpenseDialog,
  InvoiceDialog,
  PaymentDialog,
} from "@/components/ops/finance-dialogs";
import type { BudgetLineRow, CostCenterRow, ExpenseRow, InvoiceRow, PaymentRow } from "@/integrations/supabase/types";
import { updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { exportExcel } from "@/lib/export-utils";
import { brl, fmtDate, todayISO } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { daysUntil, usePartners } from "@/lib/relacionamento";
import {
  paymentState,
  useBudgetLines,
  useBudgetOverview,
  useCostCenters,
  useExpenses,
  useInvoices,
  usePayments,
} from "@/lib/financeiro";
import { profileName, useProfiles } from "@/lib/team";

const TABS = ["visao", "orcamento", "notas", "pagamentos", "despesas", "fornecedores", "centros"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Marketing Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => (TABS.includes(s.tab as Tab) ? { tab: s.tab as Tab } : {}),
  component: () => (
    <ModuleGuard module="fin_orcamento">
      <FinancePage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";

function FinancePage() {
  const nav = useNavigate({ from: "/financeiro" });
  const { tab = "visao" } = Route.useSearch();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Orçamento aprovado × comprometido × realizado, notas fiscais, pagamentos e despesas do marketing."
        actions={
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <Tabs value={tab} onValueChange={(v) => void nav({ search: { tab: v as Tab }, replace: true })}>
        <TabsList className="mb-5 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
          <TabsTrigger value="notas">Notas fiscais</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
        </TabsList>
        <TabsContent value="visao"><Overview year={year} /></TabsContent>
        <TabsContent value="orcamento"><Budget year={year} /></TabsContent>
        <TabsContent value="notas"><Invoices year={year} /></TabsContent>
        <TabsContent value="pagamentos"><Payments /></TabsContent>
        <TabsContent value="despesas"><Expenses year={year} /></TabsContent>
        <TabsContent value="fornecedores"><Suppliers year={year} /></TabsContent>
        <TabsContent value="centros"><CostCenters /></TabsContent>
      </Tabs>
    </>
  );
}

// ----------------------------------------------------------------- Visão geral

function Overview({ year }: { year: number }) {
  const nav = useNavigate({ from: "/financeiro" });
  const { data: rows = [], isLoading } = useBudgetOverview(year);
  const { data: centers = [] } = useCostCenters();
  const { data: payments = [] } = usePayments([{ column: "status", value: "Agendado" }]);
  const { data: invoices = [] } = useInvoices([{ column: "status", value: "Pendente" }]);

  // Consolida por categoria (somando centros de custo)
  const byCat = useMemo(() => {
    const m = new Map<string, { approved: number; committed: number; spent: number; planned: number }>();
    for (const r of rows) {
      const cur = m.get(r.category) ?? { approved: 0, committed: 0, spent: 0, planned: 0 };
      m.set(r.category, { approved: cur.approved + r.approved, committed: cur.committed + r.committed, spent: cur.spent + r.spent, planned: cur.planned + r.planned });
    }
    return [...m.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.approved - a.approved);
  }, [rows]);

  const total = byCat.reduce((s, r) => ({ approved: s.approved + r.approved, committed: s.committed + r.committed, spent: s.spent + r.spent }), { approved: 0, committed: 0, spent: 0 });
  const free = total.approved - total.committed - total.spent;
  const overdue = payments.filter((p) => paymentState(p) === "Atrasado");
  const soon = payments.filter((p) => paymentState(p) === "Agendado" && (daysUntil(p.due_date) ?? 99) <= 3);
  const alerts = [
    ...byCat
      .filter((r) => r.approved > 0 && (r.spent + r.committed) / r.approved >= 0.8)
      .map((r) => {
        const pct = Math.round(((r.spent + r.committed) / r.approved) * 100);
        return { tone: pct >= 100 ? "danger" : "warning", text: `${r.category}: ${pct}% do aprovado já usado ou comprometido`, tab: "orcamento" as Tab };
      }),
    ...byCat.filter((r) => r.approved === 0 && r.spent + r.committed > 0).map((r) => ({ tone: "warning", text: `${r.category}: gastos sem orçamento aprovado (${brl(r.spent + r.committed)})`, tab: "orcamento" as Tab })),
    ...(overdue.length ? [{ tone: "danger", text: `${overdue.length} pagamento(s) atrasado(s): ${brl(overdue.reduce((s, p) => s + Number(p.value), 0))}`, tab: "pagamentos" as Tab }] : []),
    ...(soon.length ? [{ tone: "warning", text: `${soon.length} pagamento(s) vencendo em até 3 dias`, tab: "pagamentos" as Tab }] : []),
    ...(invoices.length ? [{ tone: "info", text: `${invoices.length} nota(s) aguardando aprovação`, tab: "notas" as Tab }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Aprovado ${year}`} value={brl(total.approved)} />
        <Stat label="Comprometido" value={brl(total.committed)} hint="compras aprovadas + notas a pagar" />
        <Stat label="Realizado" value={brl(total.spent)} hint={total.approved ? `${Math.round((total.spent / total.approved) * 100)}% do aprovado` : undefined} />
        <Stat label="Disponível" value={brl(free)} hint={free < 0 ? "acima do aprovado" : undefined} />
      </div>

      {alerts.length > 0 && (
        <Panel title="Alertas">
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => void nav({ search: { tab: a.tab }, replace: true })}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    a.tone === "danger" ? "bg-red-500/10" : a.tone === "warning" ? "bg-amber-500/10" : "bg-muted/50"
                  }`}
                >
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${a.tone === "danger" ? "text-red-500" : a.tone === "warning" ? "text-amber-500" : "text-muted-foreground"}`} />
                  {a.text}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Por categoria do orçamento">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : byCat.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem orçamento nem gastos em {year}. Comece pela aba Orçamento.</p>
        ) : (
          <div className="space-y-4">
            {byCat.map((r) => {
              const base = Math.max(r.approved, r.spent + r.committed, 1);
              const over = r.spent + r.committed > r.approved;
              return (
                <div key={r.category}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{r.category}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="text-foreground">{brl(r.spent)}</span> realizado · {brl(r.committed)} comprometido · de{" "}
                      <span className={over ? "font-medium text-red-500" : "text-foreground"}>{brl(r.approved)}</span>
                    </span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${(r.spent / base) * 100}%` }} />
                    <div className="absolute inset-y-0 bg-primary/35" style={{ left: `${(r.spent / base) * 100}%`, width: `${(r.committed / base) * 100}%` }} />
                    {over && r.approved > 0 && <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${(r.approved / base) * 100}%` }} />}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Barra cheia = realizado · clara = comprometido · traço vermelho = limite aprovado (quando ultrapassado).
              {centers.length > 0 && " Valores somam todos os centros de custo; o detalhe por centro fica na aba Orçamento."}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ----------------------------------------------------------------- Orçamento

function Budget({ year }: { year: number }) {
  const { can } = usePermissions();
  const { data: lines = [], isLoading } = useBudgetLines(year);
  const { data: overview = [] } = useBudgetOverview(year);
  const { data: centers = [] } = useCostCenters();
  const { data: profiles } = useProfiles();
  const [open, setOpen] = useState<BudgetLineRow | "new" | null>(null);
  const ccName = (id: string | null) => (id ? centers.find((c) => c.id === id)?.code ?? "—" : "Todos");
  const used = (l: BudgetLineRow) => overview.find((o) => o.category.toLowerCase() === l.category.toLowerCase() && o.cost_center_id === l.cost_center_id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Proposto {brl(lines.reduce((s, l) => s + Number(l.planned), 0))} · aprovado {brl(lines.reduce((s, l) => s + Number(l.approved), 0))}
        </p>
        <Can module="fin_orcamento" action="create">
          <Button size="sm" onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Nova linha</Button>
        </Can>
      </div>
      {!isLoading && lines.length === 0 ? (
        <EmptyState icon={Wallet} title={`Nenhum orçamento para ${year}`} desc="Crie uma linha por categoria (e, se quiser, por centro de custo)." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
          <Table className="table-cards">
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-[100px]">Centro</TableHead>
                <TableHead className="w-[130px] text-right">Proposto</TableHead>
                <TableHead className="w-[150px] text-right">Aprovado</TableHead>
                <TableHead className="w-[130px] text-right">Comprometido</TableHead>
                <TableHead className="w-[130px] text-right">Realizado</TableHead>
                <TableHead className="w-[130px] text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const u = used(l);
                const saldo = Number(l.approved) - (u?.committed ?? 0) - (u?.spent ?? 0);
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpen(l)}>
                    <TableCell className="font-medium">{l.category}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ccName(l.cost_center_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(Number(l.planned))}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(l.approved) > 0 ? (
                        <span title={l.approved_by ? `por ${profileName(profiles, l.approved_by)}` : undefined}>{brl(Number(l.approved))}</span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-300">a aprovar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{brl(u?.committed ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(u?.spent ?? 0)}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${saldo < 0 ? "text-red-500" : ""}`}>{brl(saldo)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {can("fin_orcamento", "approve") && lines.some((l) => Number(l.approved) === 0) && (
        <p className="text-xs text-muted-foreground">Abra uma linha "a aprovar" para definir o valor aprovado.</p>
      )}
      <BudgetLineDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} line={open && open !== "new" ? open : null} year={year} />
    </div>
  );
}

// ----------------------------------------------------------------- Notas fiscais

function Invoices({ year }: { year: number }) {
  const { data: all = [], isLoading } = useInvoices();
  const { data: partners = [] } = usePartners();
  const [status, setStatus] = useState(ALL);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<InvoiceRow | "new" | null>(null);
  const supplier = (i: InvoiceRow) => partners.find((p) => p.id === i.partner_id)?.company || i.supplier_name || "—";

  const rows = all.filter(
    (i) =>
      i.issue_date.startsWith(String(year)) &&
      (status === ALL || i.status === status) &&
      (!q.trim() || `${i.number} ${supplier(i)} ${i.budget_category}`.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por número, fornecedor ou categoria" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {["Pendente", "Aprovada", "Paga", "Cancelada"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() =>
            exportExcel(`notas-fiscais-${year}`, {
              Notas: rows.map((i) => ({ Número: i.number, Fornecedor: supplier(i), Emissão: fmtDate(i.issue_date), Vencimento: fmtDate(i.due_date), Valor: Number(i.value), Categoria: i.budget_category, Status: i.status })),
            })
          }
          disabled={rows.length === 0}
        >
          <Download className="h-4 w-4" /> Excel
        </Button>
        <Can module="fin_orcamento" action="create">
          <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Lançar nota</Button>
        </Can>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead>Nota</TableHead>
              <TableHead className="w-[110px]">Emissão</TableHead>
              <TableHead className="w-[110px]">Vencimento</TableHead>
              <TableHead className="w-[180px]">Orçamento</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[130px] text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma nota em {year}.</TableCell></TableRow>}
            {rows.map((i) => (
              <TableRow key={i.id} className="cursor-pointer" onClick={() => setOpen(i)}>
                <TableCell>
                  <div className="font-medium">NF {i.number}</div>
                  <div className="text-xs text-muted-foreground">{supplier(i)}</div>
                </TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">{fmtDate(i.issue_date)}</TableCell>
                <TableCell className="text-sm tabular-nums text-muted-foreground">{fmtDate(i.due_date)}</TableCell>
                <TableCell className="text-sm">{i.budget_category || <span className="text-amber-600 dark:text-amber-300">sem categoria</span>}</TableCell>
                <TableCell><Pill value={i.status === "Pendente" ? "Aguardando aprovação" : i.status === "Aprovada" ? "Aprovado" : i.status === "Paga" ? "Concluído" : "Cancelado"} /></TableCell>
                <TableCell className="text-right tabular-nums">{brl(Number(i.value))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <InvoiceDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} invoice={open && open !== "new" ? all.find((x) => x.id === open.id) ?? open : null} />
    </div>
  );
}

// ----------------------------------------------------------------- Pagamentos

function Payments() {
  const { data: all = [], isLoading } = usePayments();
  const { data: partners = [] } = usePartners();
  const [filter, setFilter] = useState<"apagar" | "atrasados" | "pagos" | "todos">("apagar");
  const [open, setOpen] = useState<PaymentRow | "new" | null>(null);
  const today = todayISO();

  const rows = all
    .filter((p) => {
      const st = paymentState(p);
      return filter === "todos" || (filter === "apagar" && (st === "Agendado" || st === "Atrasado")) || (filter === "atrasados" && st === "Atrasado") || (filter === "pagos" && st === "Pago");
    })
    .sort((a, b) => (filter === "pagos" ? (b.paid_at ?? "").localeCompare(a.paid_at ?? "") : a.due_date.localeCompare(b.due_date)));

  const toPay = all.filter((p) => p.status === "Agendado");
  const next7 = toPay.filter((p) => p.due_date >= today && (daysUntil(p.due_date) ?? 99) <= 7);
  const late = toPay.filter((p) => p.due_date < today);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="A pagar" value={brl(toPay.reduce((s, p) => s + Number(p.value), 0))} hint={`${toPay.length} pagamentos`} />
        <Stat label="Próximos 7 dias" value={brl(next7.reduce((s, p) => s + Number(p.value), 0))} hint={`${next7.length} pagamentos`} />
        <Stat label="Atrasados" value={brl(late.reduce((s, p) => s + Number(p.value), 0))} hint={`${late.length} pagamentos`} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="apagar">A pagar</TabsTrigger>
            <TabsTrigger value="atrasados">Atrasados</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <Can module="fin_orcamento" action="create">
          <Button size="sm" variant="outline" onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Pagamento avulso</Button>
        </Can>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead>Pagamento</TableHead>
              <TableHead className="w-[120px]">Vencimento</TableHead>
              <TableHead className="w-[140px]">Forma</TableHead>
              <TableHead className="w-[110px]">Situação</TableHead>
              <TableHead className="w-[130px] text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nada aqui.</TableCell></TableRow>}
            {rows.map((p) => {
              const st = paymentState(p);
              return (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setOpen(p)}>
                  <TableCell>
                    <div className="font-medium">{p.description}</div>
                    <div className="text-xs text-muted-foreground">{partners.find((x) => x.id === p.partner_id)?.company ?? ""}</div>
                  </TableCell>
                  <TableCell className={`text-sm tabular-nums ${st === "Atrasado" ? "font-medium text-red-500" : "text-muted-foreground"}`}>
                    {fmtDate(st === "Pago" ? p.paid_at : p.due_date)}
                  </TableCell>
                  <TableCell className="text-sm">{p.method}</TableCell>
                  <TableCell><Pill value={st === "Pago" ? "Concluído" : st} /></TableCell>
                  <TableCell className="text-right tabular-nums">{brl(Number(p.value))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PaymentDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} payment={open && open !== "new" ? all.find((x) => x.id === open.id) ?? open : null} />
    </div>
  );
}

// ----------------------------------------------------------------- Despesas

function Expenses({ year }: { year: number }) {
  const { data: all = [], isLoading } = useExpenses();
  const { data: partners = [] } = usePartners();
  const { data: centers = [] } = useCostCenters();
  const [cat, setCat] = useState(ALL);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<ExpenseRow | "new" | null>(null);

  const ofYear = all.filter((e) => e.expense_date.startsWith(String(year)));
  const cats = [...new Set(ofYear.map((e) => e.budget_category).filter(Boolean))].sort();
  const rows = ofYear.filter(
    (e) => (cat === ALL || e.budget_category === cat) && (!q.trim() || e.description.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const total = rows.reduce((s, e) => s + Number(e.total), 0);
  const who = (id: string | null) => partners.find((p) => p.id === id)?.company ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar despesa" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={rows.length === 0}
          onClick={() =>
            exportExcel(`despesas-${year}`, {
              Despesas: rows.map((e) => ({
                Data: fmtDate(e.expense_date), Descrição: e.description, Fornecedor: who(e.partner_id), Categoria: e.expense_category,
                Orçamento: e.budget_category, "Centro de custo": centers.find((c) => c.id === e.cost_center_id)?.code ?? "", Forma: e.payment_method,
                Quantidade: Number(e.quantity), "Valor unitário": Number(e.unit_value), Total: Number(e.total),
              })),
            })
          }
        >
          <Download className="h-4 w-4" /> Excel
        </Button>
        <Can module="fin_orcamento" action="create">
          <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Lançar despesa</Button>
        </Can>
      </div>
      <p className="text-sm text-muted-foreground">{rows.length} despesas · {brl(total)}</p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Data</TableHead>
              <TableHead>Despesa</TableHead>
              <TableHead className="w-[200px]">Orçamento</TableHead>
              <TableHead className="w-[140px]">Origem</TableHead>
              <TableHead className="w-[130px] text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma despesa em {year}.</TableCell></TableRow>}
            {rows.map((e) => (
              <TableRow key={e.id} className="cursor-pointer" onClick={() => setOpen(e)}>
                <TableCell className="text-sm tabular-nums text-muted-foreground">{fmtDate(e.expense_date)}</TableCell>
                <TableCell>
                  <div className="font-medium">{e.description}</div>
                  <div className="text-xs text-muted-foreground">{[e.expense_category, who(e.partner_id)].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="text-sm">{e.budget_category || <span className="text-amber-600 dark:text-amber-300">sem categoria</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.payment_id ? "Pagamento de nota" : "Lançamento manual"}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(Number(e.total))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ExpenseDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} expense={open && open !== "new" ? open : null} />
    </div>
  );
}

// ----------------------------------------------------------------- Fornecedores

function Suppliers({ year }: { year: number }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: partners = [] } = usePartners();
  const { data: expenses = [] } = useExpenses();
  const { data: invoices = [] } = useInvoices();
  const ofYear = expenses.filter((e) => e.expense_date.startsWith(String(year)));

  const rows = partners
    .map((p) => {
      const spent = ofYear.filter((e) => e.partner_id === p.id).reduce((s, e) => s + Number(e.total), 0);
      const open = invoices.filter((i) => i.partner_id === p.id && (i.status === "Pendente" || i.status === "Aprovada")).reduce((s, i) => s + Number(i.value), 0);
      return { p, spent, open };
    })
    .filter((r) => r.spent > 0 || r.open > 0 || ["Fornecedor", "Agência", "Gráfica", "Brindes", "Mídia", "Rádio"].includes(r.p.category))
    .sort((a, b) => b.spent - a.spent);

  async function rate(id: string, rating: number | null) {
    try {
      await updateRow("partners", id, { rating });
      void qc.invalidateQueries({ queryKey: ["partners"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Fornecedores são os parceiros cadastrados. Totais pagos em {year} e notas em aberto.</p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="w-[150px]">Avaliação</TableHead>
              <TableHead className="w-[140px] text-right">Pago em {year}</TableHead>
              <TableHead className="w-[140px] text-right">Em aberto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum fornecedor. Cadastre em Parceiros.</TableCell></TableRow>}
            {rows.map(({ p, spent, open }) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.company}</div>
                  <div className="text-xs text-muted-foreground">{[p.category, p.city].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell>
                  {can("parceiros", "edit") ? (
                    <Select value={p.rating === null ? "none" : String(p.rating)} onValueChange={(v) => void rate(p.id, v === "none" ? null : Number(v))}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem nota</SelectItem>
                        {[5, 4, 3, 2, 1, 0].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n) || "0"} ({n})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-amber-500">{p.rating === null ? "—" : "★".repeat(p.rating) || "0"}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{brl(spent)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{brl(open)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Centros de custo

function CostCenters() {
  const { data: centers = [] } = useCostCenters();
  const { data: profiles } = useProfiles();
  const [open, setOpen] = useState<CostCenterRow | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Can module="fin_orcamento" action="create">
          <Button size="sm" onClick={() => setOpen("new")}><Plus className="h-4 w-4" /> Novo centro de custo</Button>
        </Can>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[200px]">Responsável</TableHead>
              <TableHead className="w-[100px]">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centers.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
                <TableCell className="font-mono text-sm">{c.code}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm">{c.responsible_id ? profileName(profiles, c.responsible_id) : "—"}</TableCell>
                <TableCell><Pill value={c.active ? "Ativo" : "Inativo"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CostCenterDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} center={open && open !== "new" ? open : null} />
    </div>
  );
}

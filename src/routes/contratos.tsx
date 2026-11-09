import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, ScrollText, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/ops/fields";
import { EmptyState } from "@/components/ops/record-panels";
import { ContractDialog } from "@/components/ops/rel-dialogs";
import { AlertPill } from "@/components/ops/rel-fields";
import { brl, fmtDate } from "@/lib/operacao";
import { ALERT_TONE, CONTRACT_STATUSES, contractAlert, useAppLists, useContracts, usePartners, type AlertLevel } from "@/lib/relacionamento";

export const Route = createFileRoute("/contratos")({
  head: () => ({ meta: [{ title: "Contratos — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="contratos">
      <ContractsPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
type Bucket = "all" | "expired" | "30" | "90" | "approval";

function ContractsPage() {
  const { data: contracts = [], isLoading } = useContracts();
  const { data: partners = [] } = usePartners();
  const lists = useAppLists();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [creating, setCreating] = useState(false);

  const who = (c: { partner_id: string | null; company: string }) => partners.find((p) => p.id === c.partner_id)?.company ?? c.company;

  const withAlert = useMemo(() => contracts.map((c) => ({ c, a: contractAlert(c) })), [contracts]);
  const inBucket = (a: { level: AlertLevel; days: number | null }, approval: string, b: Bucket) =>
    b === "all" ||
    (b === "expired" && a.level === "expired") ||
    (b === "30" && a.days !== null && a.days >= 0 && a.days <= 30) ||
    (b === "90" && a.days !== null && a.days > 30 && a.days <= 90) ||
    (b === "approval" && approval === "Aguardando");

  const counts = {
    expired: withAlert.filter((x) => inBucket(x.a, x.c.approval_status, "expired")).length,
    d30: withAlert.filter((x) => inBucket(x.a, x.c.approval_status, "30")).length,
    d90: withAlert.filter((x) => inBucket(x.a, x.c.approval_status, "90")).length,
    approval: withAlert.filter((x) => x.c.approval_status === "Aguardando").length,
  };

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return withAlert.filter(
      ({ c, a }) =>
        inBucket(a, c.approval_status, bucket) &&
        (status === ALL || c.status === status) &&
        (category === ALL || c.category === category) &&
        (!t || `${c.object} ${who(c)} ${c.cost_center}`.toLowerCase().includes(t)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withAlert, q, status, category, bucket, partners]);

  const active = contracts.filter((c) => ["Assinado", "Vigente", "Renovação"].includes(c.status));

  return (
    <>
      <PageHeader
        title="Contratos"
        description={`${active.length} contratos ativos somando ${brl(active.reduce((s, c) => s + Number(c.value || 0), 0))}. Alertas a 90, 30 e 7 dias do vencimento.`}
        actions={
          <Can module="contratos" action="create">
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo contrato</Button>
          </Can>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <BucketCard label="Vencidos" n={counts.expired} tone="text-red-500" active={bucket === "expired"} onClick={() => setBucket(bucket === "expired" ? "all" : "expired")} />
        <BucketCard label="Vencem em até 30 dias" n={counts.d30} tone="text-orange-500" active={bucket === "30"} onClick={() => setBucket(bucket === "30" ? "all" : "30")} />
        <BucketCard label="Vencem em 31 a 90 dias" n={counts.d90} tone="text-amber-500" active={bucket === "90"} onClick={() => setBucket(bucket === "90" ? "all" : "90")} />
        <BucketCard label="Aguardando aprovação" n={counts.approval} tone="text-primary-ink" active={bucket === "approval"} onClick={() => setBucket(bucket === "approval" ? "all" : "approval")} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por objeto, contratado ou centro de custo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CONTRACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {lists.contract_categories.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && contracts.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum contrato cadastrado" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead className="w-[190px]">Vigência</TableHead>
                <TableHead className="w-[160px]">Vencimento</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[130px] text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum contrato com esses filtros.</TableCell></TableRow>}
              {rows.map(({ c, a }) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to="/contratos/$id" params={{ id: c.id }} className="font-medium hover:text-primary-ink">{c.object}</Link>
                    <div className="text-xs text-muted-foreground">
                      {[who(c), c.category].filter(Boolean).join(" · ")}
                      {c.approval_status === "Aguardando" && <span className="ml-1 text-amber-600 dark:text-amber-300">· aguardando aprovação</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</TableCell>
                  <TableCell>{a.level === "none" ? <span className="text-xs text-muted-foreground">{a.label}</span> : <AlertPill tone={ALERT_TONE[a.level]}>{a.label}</AlertPill>}</TableCell>
                  <TableCell><Pill value={c.status} /></TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{brl(Number(c.value || 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ContractDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function BucketCard({ label, n, tone, active, onClick }: { label: string; n: number; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-card px-5 py-4 text-left transition-colors ${active ? "border-primary/60 ring-1 ring-primary/30" : "border-border hover:border-primary/30"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${n > 0 ? tone : ""}`}>{n}</div>
    </button>
  );
}

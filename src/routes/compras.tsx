import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, ShoppingCart } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { EmptyState, Stat } from "@/components/ops/record-panels";
import { InvoiceDialog, PurchaseDialog } from "@/components/ops/finance-dialogs";
import type { InvoiceRow, PurchaseRequestRow } from "@/integrations/supabase/types";
import { brl, fmtDate } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { nextStep, useFinanceSettings, usePurchaseRequests } from "@/lib/financeiro";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/compras")({
  head: () => ({ meta: [{ title: "Solicitações de compra — Marketing Hub" }] }),
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
  component: () => (
    <ModuleGuard module="fin_compras">
      <PurchasesPage />
    </ModuleGuard>
  ),
});

type View = "decidir" | "meus" | "andamento" | "todos";
const NEW = "new";

function PurchasesPage() {
  const nav = useNavigate({ from: "/compras" });
  const { id: openId } = Route.useSearch();
  const { can, profile } = usePermissions();
  const { purchase_approval_limit: limit } = useFinanceSettings();
  const { data: list = [], isLoading } = usePurchaseRequests();
  const { data: profiles } = useProfiles();
  const approver = can("fin_compras", "approve");
  const board = ["diretoria", "admin"].includes(profile?.role?.key ?? "");
  const [view, setView] = useState<View>(approver ? "decidir" : "meus");
  const [q, setQ] = useState("");
  const [invoiceFor, setInvoiceFor] = useState<Partial<InvoiceRow> | null>(null);

  const waitingMe = (p: PurchaseRequestRow) =>
    approver && p.requester_id !== profile?.id && (p.status === "Solicitado" || (p.status === "Em aprovação" && board));

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return list.filter(
      (p) =>
        (view === "todos" ||
          (view === "decidir" && waitingMe(p)) ||
          (view === "meus" && p.requester_id === profile?.id) ||
          (view === "andamento" && ["Aprovado", "Comprado", "Recebido"].includes(p.status))) &&
        (!t || `${p.code} ${p.description}`.toLowerCase().includes(t)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, view, q, profile?.id, approver, board]);

  const counts = {
    decidir: list.filter(waitingMe).length,
    andamento: list.filter((p) => ["Aprovado", "Comprado", "Recebido"].includes(p.status)).length,
    aguardando: list.filter((p) => ["Solicitado", "Em aprovação"].includes(p.status)).reduce((s, p) => s + Number(p.estimated_value), 0),
  };

  const setOpen = (id: string | undefined) => void nav({ search: id ? { id } : {}, replace: true });
  const selected = openId && openId !== NEW ? list.find((p) => p.id === openId) ?? null : null;

  return (
    <>
      <PageHeader
        title="Solicitações de compra"
        description={`Peça, aprove e acompanhe compras. Até ${brl(limit)} uma aprovação basta; acima disso, a Diretoria também aprova. Quem pede não aprova o próprio pedido.`}
        actions={
          <Can module="fin_compras" action="create">
            <Button onClick={() => setOpen(NEW)}><Plus className="h-4 w-4" /> Nova solicitação</Button>
          </Can>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {approver && <Stat label="Aguardando sua decisão" value={String(counts.decidir)} />}
        <Stat label="Em aprovação (valor)" value={brl(counts.aguardando)} />
        <Stat label="Aprovadas em andamento" value={String(counts.andamento)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            {approver && <TabsTrigger value="decidir">Para decidir ({counts.decidir})</TabsTrigger>}
            <TabsTrigger value="meus">Meus pedidos</TabsTrigger>
            <TabsTrigger value="andamento">Em andamento</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por código ou descrição" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!isLoading && list.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Nenhuma solicitação ainda" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
          <Table className="table-cards">
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead className="w-[170px]">Solicitante</TableHead>
                <TableHead className="w-[100px]">Urgência</TableHead>
                <TableHead className="w-[230px]">Situação</TableHead>
                <TableHead className="w-[130px] text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nada nesta lista.</TableCell></TableRow>}
              {rows.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setOpen(p.id)}>
                  <TableCell>
                    <div className="font-medium">{p.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.code} · {fmtDate(p.created_at.slice(0, 10))}
                      {p.needed_by && ` · precisa até ${fmtDate(p.needed_by)}`}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{profileName(profiles, p.requester_id)}</TableCell>
                  <TableCell><Pill value={p.urgency === "Urgente" ? "Crítica" : p.urgency} /></TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-0.5">
                      <Pill value={p.status === "Solicitado" || p.status === "Em aprovação" ? "Aguardando" : p.status === "Recusado" ? "Reprovada" : p.status} />
                      <span className="text-[11px] text-muted-foreground">{nextStep(p, limit)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(Number(p.final_value ?? p.estimated_value))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PurchaseDialog
        open={!!openId}
        onOpenChange={(o) => !o && setOpen(undefined)}
        request={selected}
        onInvoice={(pr) => {
          setOpen(undefined);
          setInvoiceFor({
            purchase_request_id: pr.id, partner_id: pr.partner_id, value: Number(pr.final_value ?? pr.estimated_value),
            budget_category: pr.budget_category, cost_center_id: pr.cost_center_id, campaign_id: pr.campaign_id,
            project_id: pr.project_id, event_id: pr.event_id, notes: `${pr.code} — ${pr.description}`,
          });
        }}
      />
      <InvoiceDialog open={invoiceFor !== null} onOpenChange={(o) => !o && setInvoiceFor(null)} defaults={invoiceFor ?? undefined} />
    </>
  );
}

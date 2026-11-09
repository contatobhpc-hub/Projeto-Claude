import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Handshake, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/ops/fields";
import { EmptyState, Stat } from "@/components/ops/record-panels";
import { PartnerDialog } from "@/components/ops/rel-dialogs";
import { brl } from "@/lib/operacao";
import { PARTNER_STATUSES, useAppLists, useContracts, usePartners } from "@/lib/relacionamento";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/parceiros")({
  head: () => ({ meta: [{ title: "Parceiros — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="parceiros">
      <PartnersPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";

function PartnersPage() {
  const { data: partners = [], isLoading } = usePartners();
  const { data: contracts = [] } = useContracts();
  const { data: profiles } = useProfiles();
  const lists = useAppLists();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return partners.filter(
      (p) =>
        (status === ALL || p.status === status) &&
        (category === ALL || p.category === category) &&
        (!t || `${p.company} ${p.city} ${p.contact_name}`.toLowerCase().includes(t)),
    );
  }, [partners, q, status, category]);

  const activeContracts = (id: string) => contracts.filter((c) => c.partner_id === id && ["Assinado", "Vigente", "Renovação"].includes(c.status)).length;
  const monthly = partners.filter((p) => p.status === "Ativo").reduce((s, p) => s + Number(p.investment_month || 0), 0);

  return (
    <>
      <PageHeader
        title="Parceiros"
        description="Agências, fornecedores, veículos e patrocinadores, com contratos, patrocínios e eventos de cada um."
        actions={
          <Can module="parceiros" action="create">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Novo parceiro
            </Button>
          </Can>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Parceiros ativos" value={String(partners.filter((p) => p.status === "Ativo").length)} />
        <Stat label="Em negociação ou renovação" value={String(partners.filter((p) => ["Negociação", "Renovação"].includes(p.status)).length)} />
        <Stat label="Investimento mensal (ativos)" value={brl(monthly)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por empresa, cidade ou contato" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {PARTNER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {lists.partner_categories.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && partners.length === 0 ? (
        <EmptyState icon={Handshake} title="Nenhum parceiro cadastrado" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
          <Table className="table-cards">
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[200px]">Contato</TableHead>
                <TableHead className="w-[160px]">Responsável</TableHead>
                <TableHead className="w-[110px] text-center">Contratos ativos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum parceiro com esses filtros.</TableCell></TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to="/parceiros/$id" params={{ id: p.id }} className="font-medium hover:text-primary-ink">{p.company}</Link>
                    <div className="text-xs text-muted-foreground">{[p.category, p.city].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell><Pill value={p.status} /></TableCell>
                  <TableCell className="text-sm">
                    <div>{p.contact_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.whatsapp || p.phone || p.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{p.owner_id ? profileName(profiles, p.owner_id) : "—"}</TableCell>
                  <TableCell className="text-center tabular-nums">{activeContracts(p.id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PartnerDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

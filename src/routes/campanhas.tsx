import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Megaphone, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pill } from "@/components/ops/fields";
import { EmptyState, Stat } from "@/components/ops/record-panels";
import { CampaignDialog } from "@/components/ops/campaign-dialog";
import { brl, CAMPAIGN_STATUSES, CAMPAIGN_TYPES, fmtDate, useCampaigns } from "@/lib/operacao";
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

function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { data: profiles } = useProfiles();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return campaigns.filter(
      (c) =>
        (status === ALL || c.status === status) &&
        (type === ALL || c.type === type) &&
        (!term || c.name.toLowerCase().includes(term) || c.products.some((p) => p.toLowerCase().includes(term))),
    );
  }, [campaigns, q, status, type]);

  const active = campaigns.filter((c) => c.status === "Em andamento").length;
  const waiting = campaigns.filter((c) => c.approval_status === "Aguardando").length;
  const budget = campaigns.filter((c) => !["Cancelada"].includes(c.status)).reduce((s, c) => s + Number(c.budget || 0), 0);

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Todas as campanhas da equipe, com projetos, tarefas, agenda e conteúdos ligados a cada uma."
        actions={
          <Can module="campanhas" action="create">
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nova campanha
            </Button>
          </Can>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Em andamento" value={String(active)} />
        <Stat label="Aguardando aprovação" value={String(waiting)} />
        <Stat label="Orçamento previsto (sem canceladas)" value={brl(budget)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou produto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {CAMPAIGN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {CAMPAIGN_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title="Nenhuma campanha ainda" desc="Crie a primeira campanha para organizar projetos, tarefas e conteúdos." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[100px]">Prioridade</TableHead>
                <TableHead className="w-[190px]">Período</TableHead>
                <TableHead className="w-[170px]">Responsável</TableHead>
                <TableHead className="w-[130px] text-right">Orçamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma campanha com esses filtros.</TableCell></TableRow>
              )}
              {rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link to="/campanhas/$id" params={{ id: c.id }} className="font-medium hover:text-primary-ink">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.type} · {c.objective}
                      {c.approval_status === "Aguardando" && <span className="ml-1 text-amber-600 dark:text-amber-300">· aguardando aprovação</span>}
                    </div>
                  </TableCell>
                  <TableCell><Pill value={c.status} /></TableCell>
                  <TableCell><Pill value={c.priority} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</TableCell>
                  <TableCell className="text-sm">{c.owner_id ? profileName(profiles, c.owner_id) : "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{brl(Number(c.budget || 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CampaignDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

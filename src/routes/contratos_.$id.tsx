import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";

import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { ApprovalPanel, DeleteRecordButton, InfoRow, Panel, RecordChecklist, RecordHistory, Stat } from "@/components/ops/record-panels";
import { ContractDialog } from "@/components/ops/rel-dialogs";
import { AlertPill } from "@/components/ops/rel-fields";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { brl, fmtDate, useCampaigns } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { ALERT_TONE, contractAlert, daysUntil, useContract, usePartners, useSponsorships } from "@/lib/relacionamento";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/contratos_/$id")({
  head: () => ({ meta: [{ title: "Contrato — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="contratos">
      <ContractPage />
    </ModuleGuard>
  ),
});

function ContractPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const { data: c, isLoading } = useContract(id);
  const { data: partners = [] } = usePartners();
  const { data: campaigns = [] } = useCampaigns();
  const { data: sponsorships = [] } = useSponsorships([{ column: "contract_id", value: id }]);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!c) {
    return (
      <div className="py-24 text-center">
        <h2 className="font-display text-base font-semibold">Contrato não encontrado</h2>
        <Button variant="outline" className="mt-4" asChild><Link to="/contratos">Voltar para Contratos</Link></Button>
      </div>
    );
  }

  const partner = partners.find((p) => p.id === c.partner_id);
  const campaign = campaigns.find((x) => x.id === c.campaign_id);
  const a = contractAlert(c);
  const totalDays = c.start_date && c.end_date ? Math.max(1, (daysUntil(c.end_date) ?? 0) - (daysUntil(c.start_date) ?? 0)) : null;
  const elapsed = totalDays && c.start_date ? Math.min(100, Math.max(0, Math.round((-(daysUntil(c.start_date) ?? 0) / totalDays) * 100))) : null;

  return (
    <>
      <Link to="/contratos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Contratos
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{c.object}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill value={c.status} />
            {a.level !== "none" && <AlertPill tone={ALERT_TONE[a.level]}>{a.label}</AlertPill>}
            {partner ? (
              <Link to="/parceiros/$id" params={{ id: partner.id }} className="text-sm text-muted-foreground hover:text-primary">{partner.company}</Link>
            ) : (
              <span className="text-sm text-muted-foreground">{c.company}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {can("contratos", "edit") && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar</Button>}
          {can("contratos", "delete") && <DeleteRecordButton table="contracts" id={c.id} label={c.object} onDeleted={() => void nav({ to: "/contratos" })} />}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Valor total" value={brl(Number(c.value || 0))} />
        <Stat label="Vigência" value={`${fmtDate(c.start_date).slice(0, 5)} – ${fmtDate(c.end_date)}`} hint={elapsed !== null ? `${elapsed}% do prazo decorrido` : undefined} />
        <Stat label="Renovação" value={c.auto_renewal ? "Automática" : fmtDate(c.renewal_date)} />
        <Stat label="Patrocínios ligados" value={String(sponsorships.length)} />
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos e PDF</TabsTrigger>
          <TabsTrigger value="comentarios">Comentários</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="resumo">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Dados" className="lg:col-span-2">
              <InfoRow label="Contratado">{partner?.company || c.company || "—"}</InfoRow>
              <InfoRow label="Categoria">{c.category}</InfoRow>
              <InfoRow label="Centro de custo">{c.cost_center || "—"}</InfoRow>
              <InfoRow label="Responsável">{c.owner_id ? profileName(profiles, c.owner_id) : "—"}</InfoRow>
              <InfoRow label="Campanha">
                {campaign ? <Link to="/campanhas/$id" params={{ id: campaign.id }} className="hover:text-primary">{campaign.name}</Link> : "—"}
              </InfoRow>
              <InfoRow label="Observações"><span className="whitespace-pre-wrap">{c.notes || "—"}</span></InfoRow>
            </Panel>
            <div className="space-y-4">
              <ApprovalPanel table="contracts" module="contratos" record={c} />
              <Panel><RecordChecklist module="contratos" recordId={c.id} canEdit={can("contratos", "edit")} /></Panel>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="arquivos"><Panel><RecordAttachments module="contratos" recordId={c.id} /></Panel></TabsContent>
        <TabsContent value="comentarios"><Panel><RecordComments module="contratos" recordId={c.id} /></Panel></TabsContent>
        <TabsContent value="historico"><Panel><RecordHistory table="contracts" recordId={c.id} /></Panel></TabsContent>
      </Tabs>

      <ContractDialog open={editing} onOpenChange={setEditing} contract={c} />
    </>
  );
}

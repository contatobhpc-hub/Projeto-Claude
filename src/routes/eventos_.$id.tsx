import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";

import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { DeleteRecordButton, InfoRow, Panel, RecordChecklist, RecordHistory, Stat } from "@/components/ops/record-panels";
import { MktEventDialog } from "@/components/ops/rel-dialogs";
import { AttendeesEditor, ScheduleEditor, SuppliersEditor } from "@/components/ops/event-subtables";
import { MovementsPanel } from "@/components/ops/materials-dialogs";
import { TaskList } from "@/components/ops/linked-lists";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { brl, fmtDate, useCampaigns, useChecklist, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { EVENT_CHECKLIST_GROUPS, daysUntil, useMktEvent, usePartners, useSponsorships } from "@/lib/relacionamento";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/eventos_/$id")({
  head: () => ({ meta: [{ title: "Evento — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="eventos">
      <EventPage />
    </ModuleGuard>
  ),
});

function EventPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { can, canOwn, profile } = usePermissions();
  const { data: profiles } = useProfiles();
  const { data: e, isLoading } = useMktEvent(id);
  const { data: partners = [] } = usePartners();
  const { data: campaigns = [] } = useCampaigns();
  const { data: tasks = [] } = useTasks([{ column: "event_id", value: id }]);
  const { data: sponsorships = [] } = useSponsorships([{ column: "event_id", value: id }]);
  const { data: checklist = [] } = useChecklist("eventos", id);
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!e) {
    return (
      <div className="py-24 text-center">
        <h2 className="font-display text-base font-semibold">Evento não encontrado</h2>
        <Button variant="outline" className="mt-4" asChild><Link to="/eventos">Voltar para Eventos</Link></Button>
      </div>
    );
  }

  const canEdit = can("eventos", "edit") || (e.assignee_id === profile?.id && canOwn("eventos", "edit"));
  const campaign = campaigns.find((c) => c.id === e.campaign_id);
  const done = checklist.filter((i) => i.done).length;
  const d = daysUntil(e.event_date);

  return (
    <>
      <Link to="/eventos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Eventos
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{e.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill value={e.status} />
            <Pill value={e.priority} />
            <span className="text-sm text-muted-foreground">
              {e.type} · {fmtDate(e.event_date)}
              {e.end_date && e.end_date !== e.event_date ? ` a ${fmtDate(e.end_date)}` : ""}
              {e.start_time ? ` às ${e.start_time.slice(0, 5)}` : ""}
              {e.city ? ` · ${e.city}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Editar</Button>}
          {can("eventos", "delete") && <DeleteRecordButton table="events" id={e.id} label={e.name} onDeleted={() => void nav({ to: "/eventos" })} />}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Faltam" value={d === null ? "—" : d < 0 ? "realizado" : d === 0 ? "hoje" : `${d} dias`} />
        <Stat label="Checklist" value={checklist.length ? `${Math.round((done / checklist.length) * 100)}%` : "—"} hint={`${done} de ${checklist.length} itens`} />
        <Stat label="Orçamento" value={brl(Number(e.budget || 0))} />
        <Stat label="Tarefas em aberto" value={String(tasks.filter((t) => !["Concluído", "Cancelado"].includes(t.status)).length)} />
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="convidados">Convidados</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          {can("brindes", "view") && <TabsTrigger value="brindes">Brindes</TabsTrigger>}
          {can("kanban", "view") && <TabsTrigger value="tarefas">Tarefas ({tasks.length})</TabsTrigger>}
          {can("patrocinios", "view") && sponsorships.length > 0 && <TabsTrigger value="patrocinios">Patrocínios ({sponsorships.length})</TabsTrigger>}
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          <TabsTrigger value="comentarios">Comentários</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <Panel title="Sobre o evento">
            <InfoRow label="Responsável">{e.assignee_id ? profileName(profiles, e.assignee_id) : "—"}</InfoRow>
            <InfoRow label="Equipe">{e.team_ids.length ? e.team_ids.map((t) => profileName(profiles, t)).join(", ") : "—"}</InfoRow>
            <InfoRow label="Local">{[e.venue, e.city].filter(Boolean).join(" · ") || "—"}</InfoRow>
            <InfoRow label="Agência">{e.agency || "—"}</InfoRow>
            <InfoRow label="Campanha">{campaign ? <Link to="/campanhas/$id" params={{ id: campaign.id }} className="hover:text-primary">{campaign.name}</Link> : "—"}</InfoRow>
            <InfoRow label="Parceiros">
              {e.partner_ids.length
                ? e.partner_ids.map((pid, i) => {
                    const p = partners.find((x) => x.id === pid);
                    return p ? (
                      <span key={pid}>
                        {i > 0 && ", "}
                        <Link to="/parceiros/$id" params={{ id: p.id }} className="hover:text-primary">{p.company}</Link>
                      </span>
                    ) : null;
                  })
                : "—"}
            </InfoRow>
            <InfoRow label="Público esperado">{e.expected_audience ?? "—"}</InfoRow>
            <InfoRow label="Objetivo">{e.objective || "—"}</InfoRow>
            <InfoRow label="Descrição"><span className="whitespace-pre-wrap">{e.description || "—"}</span></InfoRow>
            <InfoRow label="Observações"><span className="whitespace-pre-wrap">{e.notes || "—"}</span></InfoRow>
          </Panel>
        </TabsContent>

        <TabsContent value="checklist">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Panel><RecordChecklist module="eventos" recordId={e.id} canEdit={canEdit} title="Geral" /></Panel>
            {EVENT_CHECKLIST_GROUPS.map((g) => (
              <Panel key={g}><RecordChecklist module="eventos" recordId={e.id} canEdit={canEdit} group={g} title={g} /></Panel>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="cronograma"><Panel><ScheduleEditor eventId={e.id} canEdit={canEdit} /></Panel></TabsContent>
        <TabsContent value="convidados"><Panel><AttendeesEditor eventId={e.id} canEdit={canEdit} eventName={e.name} /></Panel></TabsContent>
        <TabsContent value="fornecedores"><Panel><SuppliersEditor eventId={e.id} canEdit={canEdit} budget={Number(e.budget || 0)} /></Panel></TabsContent>
        <TabsContent value="brindes"><Panel title="Brindes do evento"><MovementsPanel eventId={e.id} /></Panel></TabsContent>
        <TabsContent value="tarefas"><TaskList tasks={tasks} defaults={{ event_id: e.id, campaign_id: e.campaign_id }} /></TabsContent>
        <TabsContent value="patrocinios">
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {sponsorships.map((s) => (
              <li key={s.id}>
                <Link to="/patrocinios" search={{ id: s.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.institution || s.event_name}</span>
                  <span className="text-sm tabular-nums">{brl(Number(s.value))}</span>
                  <Pill value={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="arquivos"><Panel><RecordAttachments module="eventos" recordId={e.id} canAttach={canEdit || can("eventos", "create")} /></Panel></TabsContent>
        <TabsContent value="comentarios"><Panel><RecordComments module="eventos" recordId={e.id} /></Panel></TabsContent>
        <TabsContent value="historico"><Panel><RecordHistory table="events" recordId={e.id} /></Panel></TabsContent>
      </Tabs>

      <MktEventDialog open={editing} onOpenChange={setEditing} event={e} />
    </>
  );
}

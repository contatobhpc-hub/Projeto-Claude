import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";

import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { ApprovalPanel, DeleteRecordButton, InfoRow, Panel, RecordChecklist, RecordHistory, Stat } from "@/components/ops/record-panels";
import { ProjectDialog } from "@/components/ops/project-dialog";
import { ContentList, EventList, taskProgress, TaskList } from "@/components/ops/linked-lists";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { fmtDate, isOverdue, useCampaigns, useContents, useEvents, useProject, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/projetos_/$id")({
  head: () => ({ meta: [{ title: "Projeto — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="projetos">
      <ProjectPage />
    </ModuleGuard>
  ),
});

function ProjectPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const { data: p, isLoading } = useProject(id);
  const { data: campaigns = [] } = useCampaigns();
  const filter = [{ column: "project_id", value: id }];
  const { data: tasks = [] } = useTasks(filter);
  const { data: events = [] } = useEvents({ filters: filter });
  const { data: contents = [] } = useContents(filter);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="py-24 text-center">
        <h2 className="font-display text-base font-semibold">Projeto não encontrado</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ele pode ter sido excluído.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/projetos">Voltar para Projetos</Link>
        </Button>
      </div>
    );
  }

  const campaign = campaigns.find((c) => c.id === p.campaign_id);
  const progress = taskProgress(tasks);
  const late = tasks.filter((t) => isOverdue(t.due_date, ["Concluído", "Cancelado"].includes(t.status))).length;
  const canEdit = can("projetos", "edit");

  return (
    <>
      <Link to="/projetos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Projetos
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill value={p.status} />
            <Pill value={p.priority} />
            {campaign && (
              <Link to="/campanhas/$id" params={{ id: campaign.id }} className="text-sm text-muted-foreground hover:text-primary-ink">
                Campanha: {campaign.name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
          {can("projetos", "delete") && (
            <DeleteRecordButton table="projects" id={p.id} label={p.name} onDeleted={() => void nav({ to: "/projetos" })} />
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Andamento" value={progress === null ? "—" : `${progress}%`} hint={`${tasks.length} tarefas`} />
        <Stat label="Tarefas atrasadas" value={String(late)} />
        <Stat label="Prazo" value={fmtDate(p.due_date)} />
        <Stat label="Equipe" value={String(p.team_ids.length + (p.owner_id ? 1 : 0))} hint="pessoas" />
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="agenda">Agenda ({events.length})</TabsTrigger>
          <TabsTrigger value="conteudos">Conteúdos ({contents.length})</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          <TabsTrigger value="comentarios">Comentários</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Sobre" className="lg:col-span-2">
              <InfoRow label="Responsável">{p.owner_id ? profileName(profiles, p.owner_id) : "—"}</InfoRow>
              <InfoRow label="Equipe">
                {p.team_ids.length ? p.team_ids.map((t) => profileName(profiles, t)).join(", ") : "—"}
              </InfoRow>
              <InfoRow label="Área solicitante">{p.requester_area || "—"}</InfoRow>
              <InfoRow label="Cliente interno">{p.internal_client || "—"}</InfoRow>
              <InfoRow label="Descrição">
                <span className="whitespace-pre-wrap">{p.description || "—"}</span>
              </InfoRow>
            </Panel>
            <div className="space-y-4">
              <ApprovalPanel table="projects" module="projetos" record={p} />
              <Panel>
                <RecordChecklist module="projetos" recordId={p.id} canEdit={canEdit} />
              </Panel>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="tarefas">
          <TaskList tasks={tasks} defaults={{ project_id: p.id, campaign_id: p.campaign_id }} />
        </TabsContent>
        <TabsContent value="agenda">
          <EventList events={events} defaults={{ project_id: p.id, campaign_id: p.campaign_id }} />
        </TabsContent>
        <TabsContent value="conteudos">
          <ContentList items={contents} />
        </TabsContent>
        <TabsContent value="arquivos">
          <Panel>
            <RecordAttachments module="projetos" recordId={p.id} />
          </Panel>
        </TabsContent>
        <TabsContent value="comentarios">
          <Panel>
            <RecordComments module="projetos" recordId={p.id} />
          </Panel>
        </TabsContent>
        <TabsContent value="historico">
          <Panel>
            <RecordHistory table="projects" recordId={p.id} />
          </Panel>
        </TabsContent>
      </Tabs>

      <ProjectDialog open={editing} onOpenChange={setEditing} project={p} />
    </>
  );
}

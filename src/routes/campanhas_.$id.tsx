import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";

import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pill } from "@/components/ops/fields";
import { ApprovalPanel, DeleteRecordButton, InfoRow, Panel, RecordHistory, Stat } from "@/components/ops/record-panels";
import { CampaignDialog } from "@/components/ops/campaign-dialog";
import { ContentList, EventList, ProjectList, taskProgress, TaskList } from "@/components/ops/linked-lists";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { brl, fmtDate, useCampaign, useContents, useEvents, useProjects, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/campanhas_/$id")({
  head: () => ({ meta: [{ title: "Campanha — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="campanhas">
      <CampaignPage />
    </ModuleGuard>
  ),
});

function CampaignPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const { data: c, isLoading } = useCampaign(id);
  const filter = [{ column: "campaign_id", value: id }];
  const { data: projects = [] } = useProjects(filter);
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
  if (!c) {
    return (
      <div className="py-24 text-center">
        <h2 className="font-display text-base font-semibold">Campanha não encontrada</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ela pode ter sido excluída.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/campanhas">Voltar para Campanhas</Link>
        </Button>
      </div>
    );
  }

  const progress = taskProgress(tasks);
  const openTasks = tasks.filter((t) => !["Concluído", "Cancelado"].includes(t.status)).length;
  const waitingContent = contents.filter((x) => x.status === "Aguardando aprovação").length;

  return (
    <>
      <Link to="/campanhas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Campanhas
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill value={c.status} />
            <Pill value={c.priority} />
            <span className="text-sm text-muted-foreground">
              {c.type} · {c.objective} · {fmtDate(c.start_date)} – {fmtDate(c.end_date)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {can("campanhas", "edit") && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
          {can("campanhas", "delete") && (
            <DeleteRecordButton table="campaigns" id={c.id} label={c.name} onDeleted={() => void nav({ to: "/campanhas" })} />
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Andamento das tarefas" value={progress === null ? "—" : `${progress}%`} hint={`${tasks.length} tarefas`} />
        <Stat label="Tarefas em aberto" value={String(openTasks)} />
        <Stat label="Compromissos" value={String(events.length)} />
        <Stat label="Conteúdos" value={String(contents.length)} hint={waitingContent ? `${waitingContent} aguardando aprovação` : undefined} />
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="projetos">Projetos ({projects.length})</TabsTrigger>
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
              <InfoRow label="Responsável">{c.owner_id ? profileName(profiles, c.owner_id) : "—"}</InfoRow>
              <InfoRow label="Orçamento">{brl(Number(c.budget || 0))}</InfoRow>
              <InfoRow label="Produtos">
                {c.products.length ? (
                  <div className="flex flex-wrap gap-1">
                    {c.products.map((p) => (
                      <span key={p} className="rounded-md border border-border px-2 py-0.5 text-xs">
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow label="Descrição">
                <span className="whitespace-pre-wrap">{c.description || "—"}</span>
              </InfoRow>
              <InfoRow label="Observações">
                <span className="whitespace-pre-wrap">{c.notes || "—"}</span>
              </InfoRow>
            </Panel>
            <ApprovalPanel table="campaigns" module="campanhas" record={c} />
          </div>
        </TabsContent>

        <TabsContent value="projetos">
          <ProjectList projects={projects} tasks={tasks} campaignId={c.id} />
        </TabsContent>
        <TabsContent value="tarefas">
          <TaskList tasks={tasks} defaults={{ campaign_id: c.id }} />
        </TabsContent>
        <TabsContent value="agenda">
          <EventList events={events} defaults={{ campaign_id: c.id, category: "Campanha" }} />
        </TabsContent>
        <TabsContent value="conteudos">
          <ContentList items={contents} />
        </TabsContent>
        <TabsContent value="arquivos">
          <Panel>
            <RecordAttachments module="campanhas" recordId={c.id} />
          </Panel>
        </TabsContent>
        <TabsContent value="comentarios">
          <Panel>
            <RecordComments module="campanhas" recordId={c.id} />
          </Panel>
        </TabsContent>
        <TabsContent value="historico">
          <Panel>
            <RecordHistory table="campaigns" recordId={c.id} />
          </Panel>
        </TabsContent>
      </Tabs>

      <CampaignDialog open={editing} onOpenChange={setEditing} campaign={c} />
    </>
  );
}

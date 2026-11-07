import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Can, ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill } from "@/components/ops/fields";
import { TaskDialog } from "@/components/ops/task-dialog";
import type { TaskRow } from "@/integrations/supabase/types";
import { updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { fmtDate, isOverdue, TASK_STATUSES, useCampaigns, useProjects, useTasks } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { initialsOf } from "@/components/app-sidebar";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/kanban")({
  head: () => ({ meta: [{ title: "Kanban — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="kanban">
      <KanbanPage />
    </ModuleGuard>
  ),
});

const ALL = "__all__";
const MINE = "__mine__";
const NOBODY = "__nobody__";
const LIST_KEY = ["tasks", "list", []];

function KanbanPage() {
  const qc = useQueryClient();
  const { can, canOwn, profile } = usePermissions();
  const { data: tasks = [], isLoading } = useTasks();
  const { data: campaigns = [] } = useCampaigns();
  const { data: projects = [] } = useProjects();
  const { data: profiles = [] } = useProfiles();
  const [q, setQ] = useState("");
  const [who, setWho] = useState(ALL);
  const [campaign, setCampaign] = useState(ALL);
  const [project, setProject] = useState(ALL);
  const [open, setOpen] = useState<TaskRow | { status: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const fullEdit = can("kanban", "edit");
  const canMove = (t: TaskRow) => fullEdit || (t.assignee_id === profile?.id && canOwn("kanban", "edit"));

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (who === ALL || (who === MINE ? t.assignee_id === profile?.id : who === NOBODY ? !t.assignee_id : t.assignee_id === who)) &&
        (campaign === ALL || t.campaign_id === campaign) &&
        (project === ALL || t.project_id === project) &&
        (!term || t.title.toLowerCase().includes(term) || t.labels.some((l) => l.toLowerCase().includes(term))),
    );
  }, [tasks, q, who, campaign, project, profile?.id]);

  const byStatus = (s: string) => visible.filter((t) => t.status === s).sort((a, b) => a.position - b.position);

  async function move(taskId: string, status: string, beforeId: string | null) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const column = tasks.filter((t) => t.status === status && t.id !== taskId).sort((a, b) => a.position - b.position);
    let position: number;
    if (beforeId) {
      const idx = column.findIndex((t) => t.id === beforeId);
      const next = column[idx];
      const prev = column[idx - 1];
      position = prev ? (prev.position + next.position) / 2 : next.position - 1;
    } else {
      position = column.length ? column[column.length - 1].position + 1 : Date.now() / 1000;
    }
    if (task.status === status && task.position === position) return;

    const prev = qc.getQueryData<TaskRow[]>(LIST_KEY);
    qc.setQueryData<TaskRow[]>(LIST_KEY, (old) => old?.map((t) => (t.id === taskId ? { ...t, status, position } : t)));
    try {
      await updateRow("tasks", taskId, { status, position });
      if (task.status !== status) toast.success(`“${task.title}” → ${status}`);
    } catch (err) {
      qc.setQueryData(LIST_KEY, prev);
      toast.error(errorMessage(err));
    } finally {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    }
  }

  function onDrop(e: DragEvent, status: string, beforeId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setOver(null);
    if (id && id !== beforeId) void move(id, status, beforeId);
  }

  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <>
      <PageHeader
        title="Kanban"
        description="Todas as tarefas da equipe. Arraste os cartões entre colunas ou abra um cartão para mudar o status."
        actions={
          <Can module="kanban" action="create">
            <Button onClick={() => setOpen({ status: "Backlog" })}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </Can>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por título ou etiqueta" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as pessoas</SelectItem>
            <SelectItem value={MINE}>Minhas tarefas</SelectItem>
            <SelectItem value={NOBODY}>Sem responsável</SelectItem>
            {profiles.filter((p) => p.active).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaign} onValueChange={setCampaign}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as campanhas</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os projetos</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1320px] grid-cols-6 gap-3">
            {TASK_STATUSES.map((status) => {
              const items = byStatus(status);
              return (
                <section
                  key={status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(status);
                  }}
                  onDragLeave={() => setOver((o) => (o === status ? null : o))}
                  onDrop={(e) => onDrop(e, status, null)}
                  className={`flex min-h-[420px] flex-col rounded-2xl border bg-muted/30 p-2 transition-colors ${
                    over === status ? "border-primary/60 bg-primary/5" : "border-border"
                  }`}
                >
                  <header className="mb-2 flex items-center justify-between px-2 pt-1">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status}</h2>
                    <span className="rounded-md bg-background px-1.5 text-xs tabular-nums text-muted-foreground">{items.length}</span>
                  </header>
                  <div className="flex flex-1 flex-col gap-2">
                    {items.map((t) => {
                      const done = t.status === "Concluído" || t.status === "Cancelado";
                      const movable = canMove(t);
                      const extra = [campaignName(t.campaign_id), projectName(t.project_id)].filter(Boolean).join(" · ");
                      return (
                        <article
                          key={t.id}
                          draggable={movable}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", t.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(t.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOver(null);
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => onDrop(e, status, t.id)}
                          onClick={() => setOpen(t)}
                          className={`cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 ${
                            dragId === t.id ? "opacity-40" : ""
                          } ${movable ? "active:cursor-grabbing" : ""}`}
                        >
                          <div className={`text-sm font-medium leading-snug ${done ? "text-muted-foreground line-through" : ""}`}>{t.title}</div>
                          {extra && <div className="mt-1 truncate text-[11px] text-muted-foreground">{extra}</div>}
                          {t.labels.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {t.labels.slice(0, 3).map((l) => (
                                <span key={l} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {l}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <Pill value={t.priority} className="text-[10px]" />
                            <div className="flex items-center gap-2">
                              {t.due_date && (
                                <span
                                  className={`flex items-center gap-1 text-[11px] ${
                                    isOverdue(t.due_date, done) ? "font-medium text-red-500" : "text-muted-foreground"
                                  }`}
                                >
                                  <CalendarClock className="h-3 w-3" />
                                  {fmtDate(t.due_date).slice(0, 5)}
                                </span>
                              )}
                              {t.assignee_id && (
                                <span
                                  title={profileName(profiles, t.assignee_id)}
                                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
                                >
                                  {initialsOf(profileName(profiles, t.assignee_id))}
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                    {items.length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                        Solte aqui
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <TaskDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        task={open && "id" in open ? open : null}
        defaults={open && !("id" in open) ? { status: open.status } : undefined}
      />
    </>
  );
}

// Listas de itens ligados a uma campanha ou projeto.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, FileText, FolderKanban, ListTodo, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ops/fields";
import { EmptyState } from "@/components/ops/record-panels";
import { TaskDialog } from "@/components/ops/task-dialog";
import { EventDialog } from "@/components/ops/event-dialog";
import { ProjectDialog } from "@/components/ops/project-dialog";
import type { CalendarEventRow, ContentItemRow, ProjectRow, TaskRow } from "@/integrations/supabase/types";
import { fmtDate, isOverdue } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";

export function TaskList({ tasks, defaults }: { tasks: TaskRow[]; defaults: Partial<TaskRow> }) {
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const [open, setOpen] = useState<TaskRow | "new" | null>(null);
  const openTasks = tasks.filter((t) => !["Concluído", "Cancelado"].includes(t.status));
  const doneTasks = tasks.filter((t) => ["Concluído", "Cancelado"].includes(t.status));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {openTasks.length} em aberto · {doneTasks.length} concluídas/canceladas
        </p>
        {can("kanban", "create") && (
          <Button size="sm" onClick={() => setOpen("new")}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </Button>
        )}
      </div>
      {tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nenhuma tarefa" />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {[...openTasks, ...doneTasks].map((t) => {
            const done = t.status === "Concluído" || t.status === "Cancelado";
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setOpen(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.assignee_id ? profileName(profiles, t.assignee_id) : "Sem responsável"}
                      {t.due_date && (
                        <span className={isOverdue(t.due_date, done) ? " font-medium text-red-500" : ""}> · prazo {fmtDate(t.due_date)}</span>
                      )}
                    </div>
                  </div>
                  <Pill value={t.priority} className="hidden sm:inline-flex" />
                  <Pill value={t.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <TaskDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        task={open && open !== "new" ? open : null}
        defaults={defaults}
      />
    </div>
  );
}

export function EventList({ events, defaults }: { events: CalendarEventRow[]; defaults: Partial<CalendarEventRow> }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState<CalendarEventRow | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{events.length} compromissos</p>
        {can("calendario", "create") && (
          <Button size="sm" onClick={() => setOpen("new")}>
            <Plus className="h-4 w-4" /> Novo evento
          </Button>
        )}
      </div>
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nada na agenda" />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {events.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setOpen(e)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
                <div className="w-20 shrink-0 text-sm tabular-nums">
                  <div className="font-medium">{fmtDate(e.event_date).slice(0, 5)}</div>
                  <div className="text-xs text-muted-foreground">{e.start_time?.slice(0, 5) ?? "dia todo"}</div>
                </div>
                <div className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</div>
                <Pill value={e.category} className="hidden sm:inline-flex" />
                <Pill value={e.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <EventDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} event={open && open !== "new" ? open : null} defaults={defaults} />
    </div>
  );
}

export function ContentList({ items }: { items: ContentItemRow[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum conteúdo ligado"
        desc="Na Biblioteca de Conteúdos, escolha esta campanha ou projeto ao criar o conteúdo."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link to="/conteudos">Abrir Conteúdos</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((c) => (
        <li key={c.id}>
          <Link to="/conteudos" search={{ id: c.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.title}</div>
              <div className="truncate text-xs text-muted-foreground">{c.description || c.body.slice(0, 90)}</div>
            </div>
            <Pill value={c.category} className="hidden sm:inline-flex" />
            <Pill value={c.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ProjectList({ projects, tasks, campaignId }: { projects: ProjectRow[]; tasks: TaskRow[]; campaignId: string }) {
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{projects.length} projetos</p>
        {can("projetos", "create") && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Novo projeto
          </Button>
        )}
      </div>
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Nenhum projeto nesta campanha" />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {projects.map((p) => {
            const pct = taskProgress(tasks.filter((t) => t.project_id === p.id));
            return (
              <li key={p.id}>
                <Link to="/projetos/$id" params={{ id: p.id }} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.owner_id ? profileName(profiles, p.owner_id) : "Sem responsável"} · prazo {fmtDate(p.due_date)}
                    </div>
                  </div>
                  <ProgressBar value={pct} className="hidden w-28 sm:flex" />
                  <Pill value={p.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ProjectDialog open={creating} onOpenChange={setCreating} defaults={{ campaign_id: campaignId }} />
    </div>
  );
}

/** % de tarefas concluídas (canceladas não contam). Null se não houver tarefas. */
export function taskProgress(tasks: TaskRow[]): number | null {
  const valid = tasks.filter((t) => t.status !== "Cancelado");
  if (valid.length === 0) return null;
  return Math.round((valid.filter((t) => t.status === "Concluído").length / valid.length) * 100);
}

export function ProgressBar({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={`items-center gap-2 ${className ?? "flex"}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value ?? 0}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value === null ? "—" : `${value}%`}</span>
    </div>
  );
}

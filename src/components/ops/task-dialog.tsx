import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignSelect, EnumSelect, Field, PersonSelect, ProjectSelect, splitList } from "@/components/ops/fields";
import { DeleteRecordButton, RecordChecklist, RecordHistory } from "@/components/ops/record-panels";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import type { TaskRow } from "@/integrations/supabase/types";
import { insertRow, orNull, updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { PRIORITIES, TASK_STATUSES } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";

type Draft = {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  due_date: string;
  campaign_id: string | null;
  project_id: string | null;
  labels: string;
};

const blank = (d?: Partial<TaskRow>): Draft => ({
  title: d?.title ?? "",
  description: d?.description ?? "",
  status: d?.status ?? "Backlog",
  priority: d?.priority ?? "Média",
  assignee_id: d?.assignee_id ?? null,
  due_date: d?.due_date ?? "",
  campaign_id: d?.campaign_id ?? null,
  project_id: d?.project_id ?? null,
  labels: (d?.labels ?? []).join(", "),
});

/** O que a pessoa pode fazer nesta tarefa, conforme o cargo. */
export function useTaskAccess(task: TaskRow | null | undefined) {
  const { can, canOwn, profile } = usePermissions();
  const full = can("kanban", "edit");
  const own = !!task && task.assignee_id === profile?.id && canOwn("kanban", "edit");
  return { full, own, any: full || own, create: can("kanban", "create"), remove: can("kanban", "delete") };
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Tarefa existente; vazio = nova tarefa. */
  task?: TaskRow | null;
  /** Valores iniciais para nova tarefa (ex.: campanha ou projeto de origem). */
  defaults?: Partial<TaskRow>;
}) {
  const qc = useQueryClient();
  const access = useTaskAccess(task);
  const [d, setD] = useState<Draft>(blank(task ?? defaults));
  const [busy, setBusy] = useState(false);
  const isNew = !task;
  const locked = !isNew && !access.full; // dono com escopo "só atribuídos": só status e descrição

  useEffect(() => {
    if (open) setD(blank(task ?? defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = locked
      ? { status: d.status, description: d.description }
      : {
          title: d.title.trim(),
          description: d.description,
          status: d.status,
          priority: d.priority,
          assignee_id: d.assignee_id,
          due_date: orNull(d.due_date),
          campaign_id: d.campaign_id,
          project_id: d.project_id,
          event_id: task?.event_id ?? defaults?.event_id ?? null,
          labels: splitList(d.labels),
        };
    try {
      if (isNew) await insertRow("tasks", values);
      else await updateRow("tasks", task!.id, values);
      toast.success(isNew ? "Tarefa criada." : "Tarefa salva.");
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const readOnly = !isNew && !access.any;

  const form = (
    <form id="task-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Título" className="sm:col-span-2">
        <Input value={d.title} onChange={(e) => set("title", e.target.value)} required disabled={locked || readOnly} autoFocus={isNew} />
      </Field>
      <Field label="Status">
        <EnumSelect value={d.status} options={TASK_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} />
      </Field>
      <Field label="Prioridade">
        <EnumSelect value={d.priority} options={PRIORITIES} onChange={(v) => set("priority", v)} disabled={locked || readOnly} />
      </Field>
      <Field label="Responsável">
        <PersonSelect value={d.assignee_id} onChange={(v) => set("assignee_id", v)} disabled={locked || readOnly} />
      </Field>
      <Field label="Prazo">
        <Input type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} disabled={locked || readOnly} />
      </Field>
      <Field label="Campanha">
        <CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={locked || readOnly} />
      </Field>
      <Field label="Projeto">
        <ProjectSelect value={d.project_id} onChange={(v) => set("project_id", v)} campaignId={d.campaign_id} disabled={locked || readOnly} />
      </Field>
      <Field label="Etiquetas" className="sm:col-span-2" hint="Separe por vírgula.">
        <Input value={d.labels} onChange={(e) => set("labels", e.target.value)} disabled={locked || readOnly} placeholder="Instagram, Arte" />
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={4} disabled={readOnly} />
      </Field>
      {locked && (
        <p className="text-xs text-muted-foreground sm:col-span-2">Seu cargo permite atualizar o status e a descrição das tarefas atribuídas a você.</p>
      )}
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nova tarefa" : task!.title}</DialogTitle>
          <DialogDescription>{isNew ? "Preencha os dados da tarefa." : "Detalhes, checklist, arquivos e conversa da tarefa."}</DialogDescription>
        </DialogHeader>

        {isNew ? (
          form
        ) : (
          <Tabs defaultValue="dados">
            <TabsList className="mb-3">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
              <TabsTrigger value="comentarios">Comentários</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>
            {/* Sempre montado, para o botão Salvar funcionar em qualquer aba */}
            <TabsContent value="dados" forceMount className="data-[state=inactive]:hidden">
              {form}
            </TabsContent>
            <TabsContent value="checklist">
              <RecordChecklist module="kanban" recordId={task!.id} canEdit={access.any} />
            </TabsContent>
            <TabsContent value="arquivos">
              <RecordAttachments module="kanban" recordId={task!.id} canAttach={access.any} />
            </TabsContent>
            <TabsContent value="comentarios">
              <RecordComments module="kanban" recordId={task!.id} />
            </TabsContent>
            <TabsContent value="historico">
              <RecordHistory table="tasks" recordId={task!.id} />
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!isNew && access.remove && (
              <DeleteRecordButton table="tasks" id={task!.id} label={task!.title} onDeleted={() => onOpenChange(false)} />
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button type="submit" form="task-form" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {isNew ? "Criar tarefa" : "Salvar"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

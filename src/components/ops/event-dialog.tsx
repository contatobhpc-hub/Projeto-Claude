import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignSelect, EnumSelect, Field, PeoplePicker, PersonSelect, ProjectSelect } from "@/components/ops/fields";
import { DeleteRecordButton, RecordChecklist, RecordHistory } from "@/components/ops/record-panels";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import type { CalendarEventRow } from "@/integrations/supabase/types";
import { insertRow, orNull, updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { EVENT_CATEGORIES, EVENT_STATUSES, PRIORITIES, todayISO } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";

type Draft = {
  title: string;
  category: string;
  status: string;
  priority: string;
  event_date: string;
  start_time: string;
  duration_min: string;
  description: string;
  assignee_id: string | null;
  participant_ids: string[];
  agency: string;
  campaign_id: string | null;
  project_id: string | null;
};

const blank = (e?: Partial<CalendarEventRow>): Draft => ({
  title: e?.title ?? "",
  category: e?.category ?? "Reunião",
  status: e?.status ?? "Planejado",
  priority: e?.priority ?? "Média",
  event_date: e?.event_date ?? todayISO(),
  start_time: e?.start_time?.slice(0, 5) ?? "",
  duration_min: e?.duration_min ? String(e.duration_min) : "",
  description: e?.description ?? "",
  assignee_id: e?.assignee_id ?? null,
  participant_ids: e?.participant_ids ?? [],
  agency: e?.agency ?? "",
  campaign_id: e?.campaign_id ?? null,
  project_id: e?.project_id ?? null,
});

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event?: CalendarEventRow | null;
  defaults?: Partial<CalendarEventRow>;
}) {
  const qc = useQueryClient();
  const { can, canOwn, profile } = usePermissions();
  const [d, setD] = useState<Draft>(blank(event ?? defaults));
  const [busy, setBusy] = useState(false);
  const isNew = !event;
  const full = can("calendario", "edit");
  const own = !!event && event.assignee_id === profile?.id && canOwn("calendario", "edit");
  const readOnly = !isNew && !full && !own;

  useEffect(() => {
    if (open) setD(blank(event ?? defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = {
      title: d.title.trim(),
      category: d.category,
      status: d.status,
      priority: d.priority,
      event_date: d.event_date,
      start_time: orNull(d.start_time),
      duration_min: d.duration_min ? Number(d.duration_min) : null,
      description: d.description,
      assignee_id: d.assignee_id,
      participant_ids: d.participant_ids,
      agency: d.agency.trim(),
      campaign_id: d.campaign_id,
      project_id: d.project_id,
    };
    try {
      if (isNew) await insertRow("calendar_events", values);
      else await updateRow("calendar_events", event!.id, values);
      toast.success(isNew ? "Evento criado." : "Evento salvo.");
      void qc.invalidateQueries({ queryKey: ["calendar_events"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form id="event-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Título" className="sm:col-span-2">
        <Input value={d.title} onChange={(e) => set("title", e.target.value)} required disabled={readOnly} autoFocus={isNew} />
      </Field>
      <Field label="Categoria">
        <EnumSelect value={d.category} options={EVENT_CATEGORIES} onChange={(v) => set("category", v)} disabled={readOnly} />
      </Field>
      <Field label="Status">
        <EnumSelect value={d.status} options={EVENT_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} />
      </Field>
      <Field label="Data">
        <Input type="date" value={d.event_date} onChange={(e) => set("event_date", e.target.value)} required disabled={readOnly} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Horário">
          <Input type="time" value={d.start_time} onChange={(e) => set("start_time", e.target.value)} disabled={readOnly} />
        </Field>
        <Field label="Duração (min)">
          <Input type="number" min={1} value={d.duration_min} onChange={(e) => set("duration_min", e.target.value)} disabled={readOnly} />
        </Field>
      </div>
      <Field label="Prioridade">
        <EnumSelect value={d.priority} options={PRIORITIES} onChange={(v) => set("priority", v)} disabled={readOnly} />
      </Field>
      <Field label="Responsável">
        <PersonSelect value={d.assignee_id} onChange={(v) => set("assignee_id", v)} disabled={readOnly} />
      </Field>
      <Field label="Campanha">
        <CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} />
      </Field>
      <Field label="Projeto">
        <ProjectSelect value={d.project_id} onChange={(v) => set("project_id", v)} campaignId={d.campaign_id} disabled={readOnly} />
      </Field>
      <Field label="Agência / fornecedor" className="sm:col-span-2">
        <Input value={d.agency} onChange={(e) => set("agency", e.target.value)} disabled={readOnly} />
      </Field>
      <Field label="Participantes" className="sm:col-span-2">
        <PeoplePicker value={d.participant_ids} onChange={(v) => set("participant_ids", v)} disabled={readOnly} />
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} disabled={readOnly} />
      </Field>
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo evento" : event!.title}</DialogTitle>
          <DialogDescription>{isNew ? "Agende um compromisso da equipe." : "Dados, checklist, arquivos e conversa do evento."}</DialogDescription>
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
            <TabsContent value="dados" forceMount className="data-[state=inactive]:hidden">
              {form}
            </TabsContent>
            <TabsContent value="checklist">
              <RecordChecklist module="calendario" recordId={event!.id} canEdit={full || own} />
            </TabsContent>
            <TabsContent value="arquivos">
              <RecordAttachments module="calendario" recordId={event!.id} canAttach={full || own} />
            </TabsContent>
            <TabsContent value="comentarios">
              <RecordComments module="calendario" recordId={event!.id} />
            </TabsContent>
            <TabsContent value="historico">
              <RecordHistory table="calendar_events" recordId={event!.id} />
            </TabsContent>
          </Tabs>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!isNew && can("calendario", "delete") && (
              <DeleteRecordButton table="calendar_events" id={event!.id} label={event!.title} onDeleted={() => onOpenChange(false)} />
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button type="submit" form="event-form" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {isNew ? "Criar evento" : "Salvar"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

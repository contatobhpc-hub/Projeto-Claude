import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampaignSelect, EnumSelect, Field, PeoplePicker, PersonSelect } from "@/components/ops/fields";
import type { ProjectRow } from "@/integrations/supabase/types";
import { insertRow, orNull, updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { PRIORITIES, PROJECT_STATUSES } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";

type Draft = {
  name: string;
  campaign_id: string | null;
  requester_area: string;
  internal_client: string;
  owner_id: string | null;
  team_ids: string[];
  due_date: string;
  status: string;
  priority: string;
  description: string;
};

const blank = (p: Partial<ProjectRow> | null | undefined, me: string | null): Draft => ({
  name: p?.name ?? "",
  campaign_id: p?.campaign_id ?? null,
  requester_area: p?.requester_area ?? "",
  internal_client: p?.internal_client ?? "",
  owner_id: p?.id ? (p.owner_id ?? null) : (p?.owner_id ?? me),
  team_ids: p?.team_ids ?? [],
  due_date: p?.due_date ?? "",
  status: p?.status ?? "Backlog",
  priority: p?.priority ?? "Média",
  description: p?.description ?? "",
});

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  defaults,
  navigateOnCreate = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: ProjectRow | null;
  defaults?: Partial<ProjectRow>;
  navigateOnCreate?: boolean;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { profile } = usePermissions();
  const [d, setD] = useState<Draft>(blank(project ?? defaults, profile?.id ?? null));
  const [busy, setBusy] = useState(false);
  const isNew = !project;

  useEffect(() => {
    if (open) setD(blank(project ?? defaults, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const values = {
      name: d.name.trim(),
      campaign_id: d.campaign_id,
      requester_area: d.requester_area.trim(),
      internal_client: d.internal_client.trim(),
      owner_id: d.owner_id,
      team_ids: d.team_ids,
      due_date: orNull(d.due_date),
      status: d.status,
      priority: d.priority,
      description: d.description,
    };
    try {
      if (isNew) {
        const row = await insertRow<ProjectRow>("projects", values);
        toast.success("Projeto criado.");
        onOpenChange(false);
        if (navigateOnCreate) void nav({ to: "/projetos/$id", params: { id: row.id } });
      } else {
        await updateRow("projects", project!.id, values);
        toast.success("Projeto salvo.");
        onOpenChange(false);
      }
      void qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo projeto" : "Editar projeto"}</DialogTitle>
            <DialogDescription>As tarefas do projeto aparecem também no Kanban geral.</DialogDescription>
          </DialogHeader>
          <div className="my-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2">
              <Input value={d.name} onChange={(e) => set("name", e.target.value)} required autoFocus={isNew} />
            </Field>
            <Field label="Campanha">
              <CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} />
            </Field>
            <Field label="Prazo">
              <Input type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </Field>
            <Field label="Status">
              <EnumSelect value={d.status} options={PROJECT_STATUSES} onChange={(v) => set("status", v)} />
            </Field>
            <Field label="Prioridade">
              <EnumSelect value={d.priority} options={PRIORITIES} onChange={(v) => set("priority", v)} />
            </Field>
            <Field label="Área solicitante">
              <Input value={d.requester_area} onChange={(e) => set("requester_area", e.target.value)} placeholder="Ex.: Crédito" />
            </Field>
            <Field label="Cliente interno">
              <Input value={d.internal_client} onChange={(e) => set("internal_client", e.target.value)} />
            </Field>
            <Field label="Responsável" className="sm:col-span-2">
              <PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} />
            </Field>
            <Field label="Equipe" className="sm:col-span-2">
              <PeoplePicker value={d.team_ids} onChange={(v) => set("team_ids", v)} />
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isNew ? "Criar projeto" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

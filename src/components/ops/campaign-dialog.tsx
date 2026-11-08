import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnumSelect, Field, PersonSelect, splitList } from "@/components/ops/fields";
import type { CampaignRow } from "@/integrations/supabase/types";
import { insertRow, orNull, updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES, CAMPAIGN_TYPES, PRIORITIES } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { useObjectives } from "@/lib/inteligencia";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Draft = {
  name: string;
  type: string;
  objective: string;
  status: string;
  priority: string;
  start_date: string;
  end_date: string;
  owner_id: string | null;
  budget: string;
  products: string;
  description: string;
  notes: string;
  objective_id: string | null;
};

const blank = (c: CampaignRow | null | undefined, me: string | null): Draft => ({
  name: c?.name ?? "",
  type: c?.type ?? "Institucional",
  objective: c?.objective ?? "Awareness",
  status: c?.status ?? "Rascunho",
  priority: c?.priority ?? "Média",
  start_date: c?.start_date ?? "",
  end_date: c?.end_date ?? "",
  owner_id: c ? c.owner_id : me,
  // Sempre no formato brasileiro (vírgula decimal), que é como o campo é lido ao salvar
  budget: c ? String(c.budget ?? 0).replace(".", ",") : "",
  products: (c?.products ?? []).join(", "),
  description: c?.description ?? "",
  notes: c?.notes ?? "",
  objective_id: c?.objective_id ?? null,
});

export function CampaignDialog({ open, onOpenChange, campaign }: { open: boolean; onOpenChange: (o: boolean) => void; campaign?: CampaignRow | null }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { profile } = usePermissions();
  const [d, setD] = useState<Draft>(blank(campaign, profile?.id ?? null));
  const [busy, setBusy] = useState(false);
  const isNew = !campaign;

  useEffect(() => {
    if (open) setD(blank(campaign, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign?.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (d.start_date && d.end_date && d.end_date < d.start_date) {
      toast.error("O término não pode ser antes do início.");
      return;
    }
    const budget = Number(d.budget.replace(/\./g, "").replace(",", ".") || 0);
    if (Number.isNaN(budget) || budget < 0) {
      toast.error("Orçamento inválido.");
      return;
    }
    setBusy(true);
    const values = {
      name: d.name.trim(),
      type: d.type,
      objective: d.objective,
      status: d.status,
      priority: d.priority,
      start_date: orNull(d.start_date),
      end_date: orNull(d.end_date),
      owner_id: d.owner_id,
      budget,
      products: splitList(d.products),
      description: d.description,
      notes: d.notes,
      objective_id: d.objective_id,
    };
    try {
      if (isNew) {
        const row = await insertRow<CampaignRow>("campaigns", values);
        toast.success("Campanha criada.");
        onOpenChange(false);
        void nav({ to: "/campanhas/$id", params: { id: row.id } });
      } else {
        await updateRow("campaigns", campaign!.id, values);
        toast.success("Campanha salva.");
        onOpenChange(false);
      }
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
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
            <DialogTitle>{isNew ? "Nova campanha" : "Editar campanha"}</DialogTitle>
            <DialogDescription>Projetos, tarefas, agenda e conteúdos podem ser ligados à campanha depois.</DialogDescription>
          </DialogHeader>
          <div className="my-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2">
              <Input value={d.name} onChange={(e) => set("name", e.target.value)} required autoFocus={isNew} />
            </Field>
            <Field label="Tipo">
              <EnumSelect value={d.type} options={CAMPAIGN_TYPES} onChange={(v) => set("type", v)} />
            </Field>
            <Field label="Objetivo">
              <EnumSelect value={d.objective} options={CAMPAIGN_OBJECTIVES} onChange={(v) => set("objective", v)} />
            </Field>
            <Field label="Status">
              <EnumSelect value={d.status} options={CAMPAIGN_STATUSES} onChange={(v) => set("status", v)} />
            </Field>
            <Field label="Prioridade">
              <EnumSelect value={d.priority} options={PRIORITIES} onChange={(v) => set("priority", v)} />
            </Field>
            <Field label="Início">
              <Input type="date" value={d.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </Field>
            <Field label="Término">
              <Input type="date" value={d.end_date} min={d.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} />
            </Field>
            <Field label="Responsável">
              <PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} />
            </Field>
            <Field label="Orçamento (R$)">
              <Input inputMode="decimal" value={d.budget} onChange={(e) => set("budget", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Objetivo estratégico" className="sm:col-span-2" hint="Liga a campanha ao Planejamento Estratégico.">
              <ObjectiveSelect value={d.objective_id} onChange={(v) => set("objective_id", v)} />
            </Field>
            <Field label="Produtos relacionados" className="sm:col-span-2" hint="Separe por vírgula.">
              <Input value={d.products} onChange={(e) => set("products", e.target.value)} placeholder="Consórcio, Cartão, Seguro" />
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isNew ? "Criar campanha" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Objetivos do ano corrente e do próximo. */
function ObjectiveSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const y = new Date().getFullYear();
  const { data: a = [] } = useObjectives(y);
  const { data: b = [] } = useObjectives(y + 1);
  const list = [...a, ...b];
  return (
    <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sem objetivo</SelectItem>
        {list.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.year} · {o.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

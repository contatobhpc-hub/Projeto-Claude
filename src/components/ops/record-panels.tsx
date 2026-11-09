// Blocos usados nas telas de detalhe: checklist, histórico, aprovação e exclusão.

import { useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, Loader2, Plus, ShieldCheck, Trash2, XCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pill } from "@/components/ops/fields";
import { supabase } from "@/integrations/supabase/client";
import type { ApprovalStatus, Json } from "@/integrations/supabase/types";
import { softDelete, updateRow, type LiveTable } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { useChecklist, useRecordHistory } from "@/lib/operacao";
import { usePermissions, type ModuleKey } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";

export function Panel({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5 ${className ?? ""}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }: { icon: LucideIcon; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      <div className="mt-3 text-sm font-medium">{title}</div>
      {desc && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, emphasis, tone }: { label: string; value: string; hint?: string; emphasis?: boolean; tone?: "bad" }) {
  if (emphasis) {
    return (
      <div className="rounded-2xl bg-brand-dark px-4 py-4 text-white sm:px-5 dark:bg-[#0b3a43]">
        <div className="text-[13px] text-white/70">{label}</div>
        <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums">{value}</div>
        {hint && <div className="mt-1.5 text-xs text-brand-lime">{hint}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-[28px] font-bold leading-none tabular-nums ${tone === "bad" && value !== "0" ? "text-destructive" : ""}`}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------- Checklist

export function RecordChecklist({
  module,
  recordId,
  canEdit,
  group = "",
  title = "Checklist",
}: {
  module: ModuleKey;
  recordId: string;
  canEdit: boolean;
  /** Grupo do item (ex.: "Arte", "Contrapartidas"). Vazio = checklist geral. */
  group?: string;
  title?: string;
}) {
  const qc = useQueryClient();
  const { data: all = [], isLoading } = useChecklist(module, recordId);
  const items = all.filter((i) => (i.group_label ?? "") === group);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["checklist_items", module, recordId];
  const done = items.filter((i) => i.done).length;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("checklist_items").insert({ module, record_id: recordId, text: text.trim(), group_label: group });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    setText("");
    void qc.invalidateQueries({ queryKey: key });
  }

  async function toggle(id: string, value: boolean) {
    qc.setQueryData(key, (old: typeof all | undefined) => old?.map((i) => (i.id === id ? { ...i, done: value } : i)));
    const { error } = await supabase.from("checklist_items").update({ done: value }).eq("id", id);
    if (error) toast.error(errorMessage(error));
    void qc.invalidateQueries({ queryKey: key });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("checklist_items").delete().eq("id", id);
    if (error) return toast.error(errorMessage(error));
    void qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {done} de {items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/40">
              <Checkbox checked={i.done} disabled={!canEdit} onCheckedChange={(v) => void toggle(i.id, v === true)} aria-label={i.text} />
              <span className={`flex-1 text-sm ${i.done ? "text-muted-foreground line-through" : ""}`}>{i.text}</span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remover ${i.text}`}
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={() => void remove(i.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Novo item" className="h-9" />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Histórico do registro

const ACTION_TEXT: Record<string, string> = {
  insert: "criou",
  update: "alterou",
  soft_delete: "moveu para a lixeira",
  restore: "restaurou",
  delete: "apagou",
};

const FIELD_LABELS: Record<string, string> = {
  name: "nome", title: "título", status: "status", priority: "prioridade", type: "tipo", objective: "objetivo",
  description: "descrição", notes: "observações", start_date: "início", end_date: "término", owner_id: "responsável",
  products: "produtos", budget: "orçamento", approval_status: "aprovação", approval_note: "parecer",
  campaign_id: "campanha", project_id: "projeto", requester_area: "área solicitante", internal_client: "cliente interno",
  team_ids: "equipe", due_date: "prazo", assignee_id: "responsável", labels: "etiquetas", position: "ordem",
  event_date: "data", start_time: "horário", duration_min: "duração", participant_ids: "participantes", agency: "agência",
  task_id: "tarefa", category: "categoria", body: "texto", tags: "tags", review_note: "observação de revisão",
  company: "empresa", city: "cidade", contact_name: "contato", phone: "telefone", whatsapp: "WhatsApp", email: "e-mail",
  document: "CNPJ/CPF", counterparts: "contrapartidas", investment_month: "investimento mensal", expected_return: "retorno esperado",
  delivered_return: "retorno entregue", object: "objeto", partner_id: "parceiro", value: "valor", cost_center: "centro de custo",
  renewal_date: "renovação", auto_renewal: "renovação automática", venue: "local", partner_ids: "parceiros",
  expected_audience: "público esperado", event_name: "evento", institution: "instituição", tier: "cota",
  contract_id: "contrato", event_id: "evento", materials_deadline: "prazo de materiais",
  counterparts_deadline: "prazo de contrapartidas", accounting_deadline: "prazo de prestação de contas",
  report_summary: "relatório", categories: "categorias", location: "localização", supplier: "fornecedor",
  install_date: "instalação", removal_date: "retirada", code: "código", unit_value: "valor unitário",
  min_quantity: "estoque mínimo", quantity: "saldo", reserved: "reservado",
};
const SKIP = new Set(["updated_at", "updated_by", "created_at", "created_by", "approved_by", "approved_at", "completed_at", "deleted_at", "id"]);

function changed(oldD: Json | null, newD: Json | null) {
  const o = (oldD ?? {}) as Record<string, unknown>;
  const n = (newD ?? {}) as Record<string, unknown>;
  return Object.keys(n).filter((k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
}

export function RecordHistory({ table, recordId }: { table: LiveTable; recordId: string }) {
  const { data: rows = [], isLoading } = useRecordHistory(table, recordId);
  const { data: profiles } = useProfiles();
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sem alterações registradas.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {rows.map((r) => {
        const fields = r.action === "update" ? changed(r.old_data, r.new_data).filter((f) => f !== "position") : [];
        if (r.action === "update" && fields.length === 0) return null;
        const n = (r.new_data ?? {}) as Record<string, unknown>;
        return (
          <li key={r.id} className="relative">
            <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-primary" />
            <div className="text-sm">
              <strong className="font-medium">{profileName(profiles, r.changed_by)}</strong> {ACTION_TEXT[r.action] ?? r.action}
              {fields.length > 0 && <span className="text-muted-foreground"> {fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}</span>}
              {fields.includes("status") && typeof n.status === "string" && (
                <>
                  {" "}
                  → <Pill value={n.status} />
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{format(new Date(r.changed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
          </li>
        );
      })}
    </ol>
  );
}

// ----------------------------------------------------------------- Aprovação (campanhas e projetos)

export function ApprovalPanel({
  table,
  module,
  record,
}: {
  table: "campaigns" | "projects" | "contracts" | "strategic_objectives";
  module: ModuleKey;
  record: { id: string; approval_status: ApprovalStatus; approval_note: string; approved_by: string | null; approved_at: string | null };
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const canApprove = can(module, "approve");
  const canRequest = can(module, "edit");
  const s = record.approval_status;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setNote("");
      void qc.invalidateQueries({ queryKey: [table] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const decide = (decision: "Aprovada" | "Reprovada") =>
    run(async () => {
      const { error } = await supabase.rpc("decide_approval", { _table: table, _id: record.id, _decision: decision, _note: note.trim() });
      if (error) throw error;
    }, decision === "Aprovada" ? "Aprovado." : "Reprovado.");

  const request = () =>
    run(() => updateRow(table, record.id, { approval_status: "Aguardando", approval_note: "" }), "Aprovação solicitada.");

  const Icon = s === "Aprovada" ? CheckCircle2 : s === "Reprovada" ? XCircle : s === "Aguardando" ? Clock : ShieldCheck;

  return (
    <Panel title="Aprovação">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s === "Aprovada" ? "text-emerald-600 dark:text-emerald-400" : s === "Reprovada" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <Pill value={s} />
          {record.approved_by && record.approved_at && (
            <div className="text-xs text-muted-foreground">
              por {profileName(profiles, record.approved_by)} em {format(new Date(record.approved_at), "dd/MM/yyyy HH:mm")}
            </div>
          )}
          {record.approval_note && <p className="whitespace-pre-wrap text-sm">“{record.approval_note}”</p>}
        </div>
      </div>

      {s === "Aguardando" && canApprove && (
        <div className="mt-4 space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Parecer (opcional)" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("Aprovada")}>
              Aprovar
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("Reprovada")}>
              Reprovar
            </Button>
          </div>
        </div>
      )}
      {s === "Aguardando" && !canApprove && <p className="mt-3 text-xs text-muted-foreground">Aguardando a decisão de um aprovador.</p>}
      {(s === "Não solicitada" || s === "Reprovada") && canRequest && (
        <Button size="sm" variant="outline" className="mt-4" disabled={busy} onClick={() => void request()}>
          {s === "Reprovada" ? "Pedir nova aprovação" : "Pedir aprovação"}
        </Button>
      )}
    </Panel>
  );
}

// ----------------------------------------------------------------- Excluir (lixeira)

export function DeleteRecordButton({
  table,
  id,
  label,
  onDeleted,
  size = "sm",
}: {
  table: LiveTable;
  id: string;
  label: string;
  onDeleted?: () => void;
  size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" size={size} className="text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Excluir
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O item vai para a lixeira e pode ser restaurado por um Administrador em até 30 dias. Itens vinculados a ele continuam existindo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await softDelete(table, id);
                  toast.success("Movido para a lixeira.");
                  void qc.invalidateQueries({ queryKey: [table] });
                  setOpen(false);
                  onDeleted?.();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

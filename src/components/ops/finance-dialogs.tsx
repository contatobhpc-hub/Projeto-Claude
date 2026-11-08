// Cadastros e ações do Financeiro.

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignSelect, EnumSelect, Field, Pill, PersonSelect, ProjectSelect } from "@/components/ops/fields";
import { EntityDialog, useDraftSetter } from "@/components/ops/entity-dialog";
import { RecordHistory } from "@/components/ops/record-panels";
import { ListSelect, MktEventSelect, PartnerSelect } from "@/components/ops/rel-fields";
import { persist } from "@/components/ops/rel-dialogs";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetLineRow, CostCenterRow, ExpenseRow, InvoiceRow, PaymentRow, PurchaseRequestRow } from "@/integrations/supabase/types";
import { moneyInput, orNull, parseMoney, updateRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { brl, fmtDate, todayISO } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import {
  BUDGET_FOR_EXPENSE,
  nextStep,
  PAYMENT_METHODS,
  paymentState,
  URGENCIES,
  useCostCenters,
  useFinanceSettings,
  usePurchaseApprovals,
} from "@/lib/financeiro";
import { profileName, useProfiles } from "@/lib/team";

const NONE = "__none__";

export function CostCenterSelect({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { data = [] } = useCostCenters();
  const list = data.filter((c) => c.active || c.id === value);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="h-9"><SelectValue placeholder="Sem centro de custo" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem centro de custo</SelectItem>
        {list.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Categoria do orçamento (lista configurável) ou vazio. */
export function BudgetCategorySelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { budget_categories } = useFinanceSettings();
  const list = value && !budget_categories.includes(value) ? [...budget_categories, value] : budget_categories;
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sem categoria</SelectItem>
        {list.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const invalidateFinance = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ["purchase_requests", "purchase_approvals", "invoices", "payments", "expenses", "budget_lines", "budget-overview"]) {
    void qc.invalidateQueries({ queryKey: [k] });
  }
};

async function run(fn: () => Promise<unknown>, ok: string, qc: ReturnType<typeof useQueryClient>, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    await fn();
    toast.success(ok);
    invalidateFinance(qc);
    return true;
  } catch (err) {
    toast.error(errorMessage(err));
    return false;
  } finally {
    setBusy(false);
  }
}

// ================================================================= Solicitação de compra

type PRDraft = {
  description: string; justification: string; partner_id: string | null; cost_center_id: string | null; budget_category: string;
  campaign_id: string | null; project_id: string | null; event_id: string | null; estimated_value: string; urgency: string; needed_by: string;
};

const prDraft = (p: Partial<PurchaseRequestRow> | null | undefined): PRDraft => ({
  description: p?.description ?? "", justification: p?.justification ?? "", partner_id: p?.partner_id ?? null,
  cost_center_id: p?.cost_center_id ?? null, budget_category: p?.budget_category ?? "", campaign_id: p?.campaign_id ?? null,
  project_id: p?.project_id ?? null, event_id: p?.event_id ?? null, estimated_value: moneyInput(p?.estimated_value),
  urgency: p?.urgency ?? "Média", needed_by: p?.needed_by ?? "",
});

export function PurchaseDialog({
  open,
  onOpenChange,
  request,
  defaults,
  onInvoice,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  request?: PurchaseRequestRow | null;
  defaults?: Partial<PurchaseRequestRow>;
  /** Abrir o cadastro de nota fiscal já ligado a esta compra. */
  onInvoice?: (pr: PurchaseRequestRow) => void;
}) {
  const qc = useQueryClient();
  const { can, profile } = usePermissions();
  const { purchase_approval_limit: limit } = useFinanceSettings();
  const { data: approvals = [] } = usePurchaseApprovals(request?.id);
  const { data: profiles } = useProfiles();
  const [d, setD] = useState(prDraft(request ?? defaults));
  const set = useDraftSetter<PRDraft>(setD);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [finalValue, setFinalValue] = useState("");
  const isNew = !request;
  const editor = can("fin_compras", "edit");
  const mine = !!request && request.requester_id === profile?.id;
  const editable = isNew ? can("fin_compras", "create") : (editor || mine) && ["Rascunho", "Solicitado"].includes(request!.status);
  const canDecide =
    !!request && can("fin_compras", "approve") && !mine && ["Solicitado", "Em aprovação"].includes(request.status) &&
    !approvals.some((a) => a.decided_by === profile?.id) &&
    (request.status === "Solicitado" || ["diretoria", "admin"].includes(profile?.role?.key ?? ""));

  useEffect(() => {
    if (open) {
      setD(prDraft(request ?? defaults));
      setNote("");
      setFinalValue(moneyInput(request?.final_value ?? request?.estimated_value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id, request?.status]);

  async function save(submit: boolean) {
    const value = parseMoney(d.estimated_value);
    if (Number.isNaN(value) || value < 0) return void toast.error("Valor estimado inválido.");
    if (!d.description.trim()) return void toast.error("Descreva o que vai ser comprado.");
    const values: Record<string, unknown> = {
      description: d.description.trim(), justification: d.justification, partner_id: d.partner_id, cost_center_id: d.cost_center_id,
      budget_category: d.budget_category, campaign_id: d.campaign_id, project_id: d.project_id, event_id: d.event_id,
      estimated_value: value, urgency: d.urgency, needed_by: orNull(d.needed_by),
    };
    if (submit) values.status = "Solicitado";
    const ok = await run(() => persist("purchase_requests", request, values), submit ? "Enviado para aprovação." : "Salvo.", qc, setBusy);
    if (ok) onOpenChange(false);
  }

  const setStatus = (status: string, extra: Record<string, unknown> = {}, msg = "Status atualizado.") =>
    run(() => updateRow("purchase_requests", request!.id, { status, ...extra }), msg, qc, setBusy);

  const decide = (decision: "Aprovado" | "Recusado") =>
    run(
      async () => {
        const { data, error } = await supabase.rpc("decide_purchase", { _id: request!.id, _decision: decision, _note: note.trim() });
        if (error) throw error;
        if (data === "Em aprovação") toast.info("Valor acima da alçada: agora segue para a Diretoria.");
      },
      decision === "Aprovado" ? "Aprovação registrada." : "Solicitação recusada.",
      qc,
      setBusy,
    );

  const s = request?.status;
  const id = request?.id;

  const actions = request && (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill value={s!} />
        <span className="text-muted-foreground">{nextStep(request, limit)}</span>
        {request.estimated_value > limit && <span className="text-xs text-muted-foreground">· acima da alçada de {brl(limit)}</span>}
      </div>
      {approvals.length > 0 && (
        <ul className="space-y-1 text-sm">
          {approvals.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              {a.decision === "Aprovado" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
              <span>
                <strong className="font-medium">{profileName(profiles, a.decided_by)}</strong> ({a.level}) {a.decision.toLowerCase()} em{" "}
                {format(new Date(a.decided_at), "dd/MM/yy HH:mm")}
                {a.note && <span className="text-muted-foreground"> — “{a.note}”</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canDecide && (
        <div className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Parecer (opcional)" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void decide("Aprovado")}>Aprovar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide("Recusado")}>Recusar</Button>
          </div>
        </div>
      )}
      {mine && can("fin_compras", "approve") && ["Solicitado", "Em aprovação"].includes(s!) && (
        <p className="text-xs text-muted-foreground">Você fez este pedido, então a aprovação fica com outra pessoa.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {mine && s === "Solicitado" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("Rascunho", {}, "Voltou para rascunho.")}>Voltar a rascunho</Button>}
        {(mine || editor) && (s === "Rascunho" || s === "Solicitado") && (
          <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => void setStatus("Cancelado", {}, "Solicitação cancelada.")}>Cancelar pedido</Button>
        )}
        {editor && s === "Aprovado" && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Valor final da compra (R$)">
              <Input className="h-9 w-40" inputMode="decimal" value={finalValue} onChange={(e) => setFinalValue(e.target.value)} />
            </Field>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const v = parseMoney(finalValue);
                if (Number.isNaN(v) || v < 0) return void toast.error("Valor final inválido.");
                void setStatus("Comprado", { final_value: v }, "Compra registrada.");
              }}
            >
              Registrar compra
            </Button>
          </div>
        )}
        {editor && s === "Comprado" && <Button size="sm" disabled={busy} onClick={() => void setStatus("Recebido", {}, "Recebimento registrado.")}>Marcar como recebido</Button>}
        {editor && (s === "Comprado" || s === "Recebido") && onInvoice && can("fin_orcamento", "create") && (
          <Button size="sm" variant="outline" onClick={() => onInvoice(request)}>Lançar nota fiscal</Button>
        )}
        {editor && s === "Recebido" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("Concluído", {}, "Compra concluída.")}>Concluir</Button>}
        {editor && (s === "Aprovado" || s === "Comprado") && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void setStatus("Cancelado", {}, "Compra cancelada.")}>Cancelar compra</Button>
        )}
      </div>
    </div>
  );

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Nova solicitação de compra" : `${request!.code} · ${request!.description}`}
      description={
        isNew
          ? `Até ${brl(limit)}, uma aprovação basta. Acima disso, o pedido segue também para a Diretoria.`
          : `Pedido de ${profileName(profiles, request!.requester_id)} em ${fmtDate(request!.created_at.slice(0, 10))}`
      }
      formId="pr-form"
      isNew={isNew}
      readOnly={!editable}
      busy={busy}
      submitLabel={isNew ? "Salvar rascunho" : "Salvar"}
      wide
      tabs={
        id
          ? [
              { value: "arquivos", label: "Orçamentos e anexos", content: <RecordAttachments module="fin_compras" recordId={id} canAttach={editable || editor} /> },
              { value: "comentarios", label: "Comentários", content: <RecordComments module="fin_compras" recordId={id} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="purchase_requests" recordId={id} /> },
            ]
          : []
      }
      form={
        <>
          {actions}
          <form
            id="pr-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void save(false);
            }}
            className="grid gap-3 sm:grid-cols-3"
          >
            <Field label="O que comprar" className="sm:col-span-3">
              <Input value={d.description} onChange={(e) => set("description", e.target.value)} required disabled={!editable} autoFocus={isNew} />
            </Field>
            <Field label="Justificativa" className="sm:col-span-3">
              <Textarea value={d.justification} onChange={(e) => set("justification", e.target.value)} rows={2} disabled={!editable} />
            </Field>
            <Field label="Valor estimado (R$)"><Input inputMode="decimal" value={d.estimated_value} onChange={(e) => set("estimated_value", e.target.value)} disabled={!editable} /></Field>
            <Field label="Urgência"><EnumSelect value={d.urgency} options={URGENCIES} onChange={(v) => set("urgency", v)} disabled={!editable} /></Field>
            <Field label="Precisa até"><Input type="date" value={d.needed_by} onChange={(e) => set("needed_by", e.target.value)} disabled={!editable} /></Field>
            <Field label="Fornecedor sugerido"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={!editable} /></Field>
            <Field label="Centro de custo"><CostCenterSelect value={d.cost_center_id} onChange={(v) => set("cost_center_id", v)} disabled={!editable} /></Field>
            <Field label="Categoria do orçamento"><BudgetCategorySelect value={d.budget_category} onChange={(v) => set("budget_category", v)} disabled={!editable} /></Field>
            <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={!editable} /></Field>
            <Field label="Projeto"><ProjectSelect value={d.project_id} onChange={(v) => set("project_id", v)} campaignId={d.campaign_id} disabled={!editable} /></Field>
            <Field label="Evento"><MktEventSelect value={d.event_id} onChange={(v) => set("event_id", v)} disabled={!editable} /></Field>
            {editable && (isNew || s === "Rascunho") && (
              <div className="sm:col-span-3">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void save(true)}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar e enviar para aprovação
                </Button>
              </div>
            )}
          </form>
        </>
      }
    />
  );
}

// ================================================================= Nota fiscal

type InvDraft = {
  number: string; partner_id: string | null; supplier_name: string; issue_date: string; due_date: string; value: string;
  expense_category: string; budget_category: string; cost_center_id: string | null; campaign_id: string | null;
  project_id: string | null; event_id: string | null; payment_method: string; notes: string; purchase_request_id: string | null;
};

const invDraft = (i: Partial<InvoiceRow> | null | undefined): InvDraft => ({
  number: i?.number ?? "", partner_id: i?.partner_id ?? null, supplier_name: i?.supplier_name ?? "", issue_date: i?.issue_date ?? todayISO(),
  due_date: i?.due_date ?? "", value: moneyInput(i?.value), expense_category: i?.expense_category ?? "Outros",
  budget_category: i?.budget_category ?? "", cost_center_id: i?.cost_center_id ?? null, campaign_id: i?.campaign_id ?? null,
  project_id: i?.project_id ?? null, event_id: i?.event_id ?? null, payment_method: i?.payment_method ?? "Boleto", notes: i?.notes ?? "",
  purchase_request_id: i?.purchase_request_id ?? null,
});

export function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice?: InvoiceRow | null;
  defaults?: Partial<InvoiceRow>;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { expense_categories } = useFinanceSettings();
  const [d, setD] = useState(invDraft(invoice ?? defaults));
  const set = useDraftSetter<InvDraft>(setD);
  const [busy, setBusy] = useState(false);
  const isNew = !invoice;
  const locked = !!invoice && invoice.status !== "Pendente";
  const readOnly = isNew ? !can("fin_orcamento", "create") : !can("fin_orcamento", "edit");
  const approver = can("fin_orcamento", "approve");

  useEffect(() => {
    if (open) setD(invDraft(invoice ?? defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id, invoice?.status]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(d.value);
    if (Number.isNaN(value) || value <= 0) return void toast.error("Informe o valor da nota.");
    if (!d.partner_id && !d.supplier_name.trim()) return void toast.error("Escolha o fornecedor ou digite o nome dele.");
    const ok = await run(
      () =>
        persist("invoices", invoice, {
          number: d.number.trim(), partner_id: d.partner_id, supplier_name: d.supplier_name.trim(), issue_date: d.issue_date,
          due_date: orNull(d.due_date), value, expense_category: d.expense_category, budget_category: d.budget_category,
          cost_center_id: d.cost_center_id, campaign_id: d.campaign_id, project_id: d.project_id, event_id: d.event_id,
          payment_method: d.payment_method, notes: d.notes, purchase_request_id: d.purchase_request_id,
        }),
      isNew ? "Nota lançada. Ela aguarda aprovação para ir a pagamento." : "Nota salva.",
      qc,
      setBusy,
    );
    if (ok) onOpenChange(false);
  }

  const decide = (approve: boolean) =>
    run(
      async () => {
        const { error } = await supabase.rpc("decide_invoice", { _id: invoice!.id, _approve: approve });
        if (error) throw error;
      },
      approve ? "Nota aprovada. O pagamento foi agendado." : "Nota reaberta.",
      qc,
      setBusy,
    );

  const id = invoice?.id;
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Lançar nota fiscal" : `NF ${invoice!.number}`}
      formId="inv-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      wide
      remove={id && can("fin_orcamento", "delete") && invoice!.status !== "Paga" ? { table: "invoices", id, label: `NF ${invoice!.number}` } : undefined}
      tabs={
        id
          ? [
              { value: "arquivos", label: "PDF, XML e comprovantes", content: <RecordAttachments module="fin_orcamento" recordId={id} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="invoices" recordId={id} /> },
            ]
          : []
      }
      form={
        <>
          {invoice && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <Pill value={invoice.status} />
              {invoice.status === "Pendente" && !approver && <span className="text-muted-foreground">Aguardando aprovação</span>}
              {invoice.status === "Pendente" && approver && <Button size="sm" disabled={busy} onClick={() => void decide(true)}>Aprovar e agendar pagamento</Button>}
              {invoice.status === "Aprovada" && approver && <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(false)}>Reabrir</Button>}
              {invoice.status === "Pendente" && can("fin_orcamento", "edit") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => void run(() => updateRow("invoices", invoice.id, { status: "Cancelada" }), "Nota cancelada.", qc, setBusy)}
                >
                  Cancelar nota
                </Button>
              )}
              {locked && <span className="text-xs text-muted-foreground">Valor, fornecedor e número ficam travados depois da aprovação.</span>}
            </div>
          )}
          <form id="inv-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <Field label="Número da nota"><Input value={d.number} onChange={(e) => set("number", e.target.value)} required disabled={readOnly || locked} autoFocus={isNew} /></Field>
            <Field label="Valor (R$)"><Input inputMode="decimal" value={d.value} onChange={(e) => set("value", e.target.value)} required disabled={readOnly || locked} /></Field>
            <Field label="Forma de pagamento"><EnumSelect value={d.payment_method} options={PAYMENT_METHODS} onChange={(v) => set("payment_method", v)} disabled={readOnly} /></Field>
            <Field label="Fornecedor (parceiro)"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={readOnly || locked} /></Field>
            <Field label="Ou nome do fornecedor"><Input value={d.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} disabled={readOnly || locked} /></Field>
            <Field label="Emissão"><Input type="date" value={d.issue_date} onChange={(e) => set("issue_date", e.target.value)} required disabled={readOnly} /></Field>
            <Field label="Vencimento" hint="Sem vencimento, o pagamento é agendado para 7 dias."><Input type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} disabled={readOnly} /></Field>
            <Field label="Categoria da despesa">
              <ListSelect
                value={d.expense_category}
                list={expense_categories}
                disabled={readOnly}
                onChange={(v) => setD((x) => ({ ...x, expense_category: v, budget_category: x.budget_category || BUDGET_FOR_EXPENSE[v] || "" }))}
              />
            </Field>
            <Field label="Categoria do orçamento"><BudgetCategorySelect value={d.budget_category} onChange={(v) => set("budget_category", v)} disabled={readOnly} /></Field>
            <Field label="Centro de custo"><CostCenterSelect value={d.cost_center_id} onChange={(v) => set("cost_center_id", v)} disabled={readOnly} /></Field>
            <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} /></Field>
            <Field label="Evento"><MktEventSelect value={d.event_id} onChange={(v) => set("event_id", v)} disabled={readOnly} /></Field>
            <Field label="Observações" className="sm:col-span-3"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} /></Field>
          </form>
        </>
      }
    />
  );
}

// ================================================================= Pagamento

type PayDraft = { description: string; partner_id: string | null; value: string; due_date: string; method: string; notes: string };

const payDraft = (p: PaymentRow | null | undefined): PayDraft => ({
  description: p?.description ?? "", partner_id: p?.partner_id ?? null, value: moneyInput(p?.value), due_date: p?.due_date ?? todayISO(),
  method: p?.method ?? "Boleto", notes: p?.notes ?? "",
});

export function PaymentDialog({ open, onOpenChange, payment }: { open: boolean; onOpenChange: (o: boolean) => void; payment?: PaymentRow | null }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: profiles } = useProfiles();
  const [d, setD] = useState(payDraft(payment));
  const set = useDraftSetter<PayDraft>(setD);
  const [paidAt, setPaidAt] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const isNew = !payment;
  const fromInvoice = !!payment?.invoice_id;
  const readOnly = isNew ? !can("fin_orcamento", "create") : !can("fin_orcamento", "edit") || payment!.status !== "Agendado";

  useEffect(() => {
    if (open) {
      setD(payDraft(payment));
      setPaidAt(todayISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment?.id, payment?.status]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(d.value);
    if (Number.isNaN(value) || value <= 0) return void toast.error("Valor inválido.");
    const values: Record<string, unknown> = fromInvoice
      ? { due_date: d.due_date, method: d.method, notes: d.notes }
      : { description: d.description.trim(), partner_id: d.partner_id, value, due_date: d.due_date, method: d.method, notes: d.notes };
    if (await run(() => persist("payments", payment, values), isNew ? "Pagamento agendado." : "Pagamento salvo.", qc, setBusy)) onOpenChange(false);
  }

  const st = payment ? paymentState(payment) : null;
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Agendar pagamento" : payment!.description}
      description={fromInvoice ? "Gerado pela aprovação da nota fiscal." : isNew ? "Para pagamentos sem nota (taxas, reembolsos…). Ao registrar o pagamento, a despesa é lançada." : undefined}
      formId="pay-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      tabs={payment ? [{ value: "historico", label: "Histórico", content: <RecordHistory table="payments" recordId={payment.id} /> }] : []}
      form={
        <>
          {payment && (
            <div className="mb-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pill value={st!} />
                {payment.status === "Pago" && (
                  <span className="text-muted-foreground">
                    em {fmtDate(payment.paid_at)} por {profileName(profiles, payment.paid_by)}
                  </span>
                )}
              </div>
              {payment.status === "Agendado" && can("fin_orcamento", "edit") && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Data do pagamento"><Input type="date" className="h-9 w-40" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
                  <Button size="sm" disabled={busy} onClick={() => void run(() => updateRow("payments", payment.id, { status: "Pago", paid_at: paidAt }), "Pagamento registrado e despesa lançada.", qc, setBusy)}>
                    Registrar pagamento
                  </Button>
                  {!fromInvoice && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void run(() => updateRow("payments", payment.id, { status: "Cancelado" }), "Pagamento cancelado.", qc, setBusy)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
              {payment.status === "Pago" && can("fin_orcamento", "approve") && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => updateRow("payments", payment.id, { status: "Agendado" }), "Pagamento estornado.", qc, setBusy)}>
                  Estornar pagamento
                </Button>
              )}
            </div>
          )}
          <form id="pay-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Descrição" className="sm:col-span-2"><Input value={d.description} onChange={(e) => set("description", e.target.value)} required disabled={readOnly || fromInvoice} /></Field>
            <Field label="Valor (R$)"><Input inputMode="decimal" value={d.value} onChange={(e) => set("value", e.target.value)} required disabled={readOnly || fromInvoice} /></Field>
            <Field label="Vencimento"><Input type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} required disabled={readOnly} /></Field>
            <Field label="Forma"><EnumSelect value={d.method} options={PAYMENT_METHODS} onChange={(v) => set("method", v)} disabled={readOnly} /></Field>
            <Field label="Favorecido (parceiro)"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={readOnly || fromInvoice} /></Field>
            <Field label="Observações" className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} /></Field>
          </form>
        </>
      }
    />
  );
}

// ================================================================= Despesa (lançamento manual)

type ExpDraft = {
  description: string; expense_category: string; budget_category: string; cost_center_id: string | null; partner_id: string | null;
  campaign_id: string | null; event_id: string | null; quantity: string; unit_value: string; expense_date: string;
  payment_method: string; owner_id: string | null; notes: string;
};

const expDraft = (e: ExpenseRow | null | undefined, me: string | null): ExpDraft => ({
  description: e?.description ?? "", expense_category: e?.expense_category ?? "Outros", budget_category: e?.budget_category ?? "",
  cost_center_id: e?.cost_center_id ?? null, partner_id: e?.partner_id ?? null, campaign_id: e?.campaign_id ?? null,
  event_id: e?.event_id ?? null, quantity: e ? String(e.quantity).replace(".", ",") : "1", unit_value: moneyInput(e?.unit_value),
  expense_date: e?.expense_date ?? todayISO(), payment_method: e?.payment_method ?? "Cartão Corporativo", owner_id: e ? e.owner_id : me,
  notes: e?.notes ?? "",
});

export function ExpenseDialog({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense?: ExpenseRow | null }) {
  const qc = useQueryClient();
  const { can, profile } = usePermissions();
  const { expense_categories } = useFinanceSettings();
  const [d, setD] = useState(expDraft(expense, profile?.id ?? null));
  const set = useDraftSetter<ExpDraft>(setD);
  const [busy, setBusy] = useState(false);
  const isNew = !expense;
  const auto = !!expense?.payment_id;
  const readOnly = (isNew ? !can("fin_orcamento", "create") : !can("fin_orcamento", "edit")) || auto;

  useEffect(() => {
    if (open) setD(expDraft(expense, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const qty = parseMoney(d.quantity), unit = parseMoney(d.unit_value);
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(unit) || unit < 0) return void toast.error("Confira quantidade e valor.");
    const ok = await run(
      () =>
        persist("expenses", expense, {
          description: d.description.trim(), expense_category: d.expense_category, budget_category: d.budget_category,
          cost_center_id: d.cost_center_id, partner_id: d.partner_id, campaign_id: d.campaign_id, event_id: d.event_id, quantity: qty,
          unit_value: unit, expense_date: d.expense_date, payment_method: d.payment_method, owner_id: d.owner_id, notes: d.notes,
        }),
      isNew ? "Despesa lançada." : "Despesa salva.",
      qc,
      setBusy,
    );
    if (ok) onOpenChange(false);
  }

  const total = (parseMoney(d.quantity) || 0) * (parseMoney(d.unit_value) || 0);
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Lançar despesa" : expense!.description}
      description={auto ? "Lançada automaticamente pelo pagamento; para corrigir, estorne o pagamento." : "Para gastos sem nota passando pelo fluxo (cartão corporativo, pequenas compras)."}
      formId="exp-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      remove={expense && !auto && can("fin_orcamento", "delete") ? { table: "expenses", id: expense.id, label: expense.description } : undefined}
      tabs={
        expense
          ? [
              { value: "arquivos", label: "Comprovantes", content: <RecordAttachments module="fin_orcamento" recordId={expense.id} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="expenses" recordId={expense.id} /> },
            ]
          : []
      }
      form={
        <form id="exp-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Descrição" className="sm:col-span-3"><Input value={d.description} onChange={(e) => set("description", e.target.value)} required disabled={readOnly} autoFocus={isNew} /></Field>
          <Field label="Quantidade"><Input inputMode="decimal" value={d.quantity} onChange={(e) => set("quantity", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Valor unitário (R$)"><Input inputMode="decimal" value={d.unit_value} onChange={(e) => set("unit_value", e.target.value)} required disabled={readOnly} /></Field>
          <Field label="Total"><div className="flex h-9 items-center text-sm font-medium tabular-nums">{brl(total)}</div></Field>
          <Field label="Data"><Input type="date" value={d.expense_date} onChange={(e) => set("expense_date", e.target.value)} required disabled={readOnly} /></Field>
          <Field label="Forma de pagamento"><EnumSelect value={d.payment_method} options={PAYMENT_METHODS} onChange={(v) => set("payment_method", v)} disabled={readOnly} /></Field>
          <Field label="Responsável"><PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} disabled={readOnly} /></Field>
          <Field label="Categoria da despesa">
            <ListSelect
              value={d.expense_category}
              list={expense_categories}
              disabled={readOnly}
              onChange={(v) => setD((x) => ({ ...x, expense_category: v, budget_category: x.budget_category || BUDGET_FOR_EXPENSE[v] || "" }))}
            />
          </Field>
          <Field label="Categoria do orçamento"><BudgetCategorySelect value={d.budget_category} onChange={(v) => set("budget_category", v)} disabled={readOnly} /></Field>
          <Field label="Centro de custo"><CostCenterSelect value={d.cost_center_id} onChange={(v) => set("cost_center_id", v)} disabled={readOnly} /></Field>
          <Field label="Fornecedor"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={readOnly} /></Field>
          <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} /></Field>
          <Field label="Evento"><MktEventSelect value={d.event_id} onChange={(v) => set("event_id", v)} disabled={readOnly} /></Field>
          <Field label="Observações" className="sm:col-span-3"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} /></Field>
        </form>
      }
    />
  );
}

// ================================================================= Linha de orçamento

export function BudgetLineDialog({
  open,
  onOpenChange,
  line,
  year,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  line?: BudgetLineRow | null;
  year: number;
}) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [category, setCategory] = useState(line?.category ?? "");
  const [cc, setCc] = useState<string | null>(line?.cost_center_id ?? null);
  const [planned, setPlanned] = useState(moneyInput(line?.planned));
  const [approved, setApproved] = useState(moneyInput(line?.approved));
  const [notes, setNotes] = useState(line?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const isNew = !line;
  const editor = isNew ? can("fin_orcamento", "create") : can("fin_orcamento", "edit");
  const approver = can("fin_orcamento", "approve");

  useEffect(() => {
    if (!open) return;
    setCategory(line?.category ?? "");
    setCc(line?.cost_center_id ?? null);
    setPlanned(moneyInput(line?.planned));
    setApproved(moneyInput(line?.approved));
    setNotes(line?.notes ?? "");
  }, [open, line]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = parseMoney(planned), a = parseMoney(approved);
    if (!category) return void toast.error("Escolha a categoria.");
    if (Number.isNaN(p) || p < 0 || Number.isNaN(a) || a < 0) return void toast.error("Confira os valores.");
    const ok = await run(
      async () => {
        let row = line;
        if (editor) row = await persist<BudgetLineRow>("budget_lines", line, { year, category, cost_center_id: cc, planned: p, notes });
        if (approver && row && a !== Number(row.approved ?? 0)) {
          const { error } = await supabase.rpc("approve_budget_line", { _id: row.id, _amount: a });
          if (error) throw error;
        }
      },
      "Orçamento salvo.",
      qc,
      setBusy,
    );
    if (ok) onOpenChange(false);
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? `Nova linha do orçamento ${year}` : `${line!.category} · ${year}`}
      description="O valor proposto é da equipe; o valor aprovado só quem tem permissão de aprovar define."
      formId="budget-form"
      isNew={isNew}
      readOnly={!editor && !approver}
      busy={busy}
      remove={line && can("fin_orcamento", "delete") ? { table: "budget_lines", id: line.id, label: `${line.category} ${year}` } : undefined}
      tabs={line ? [{ value: "historico", label: "Histórico", content: <RecordHistory table="budget_lines" recordId={line.id} /> }] : []}
      form={
        <form id="budget-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria"><BudgetCategorySelect value={category} onChange={setCategory} disabled={!editor} /></Field>
          <Field label="Centro de custo (opcional)"><CostCenterSelect value={cc} onChange={setCc} disabled={!editor} /></Field>
          <Field label="Proposto (R$)"><Input inputMode="decimal" value={planned} onChange={(e) => setPlanned(e.target.value)} disabled={!editor} /></Field>
          <Field label="Aprovado (R$)" hint={approver ? undefined : "Definido por um aprovador."}>
            <Input inputMode="decimal" value={approved} onChange={(e) => setApproved(e.target.value)} disabled={!approver} />
          </Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={!editor} /></Field>
        </form>
      }
    />
  );
}

// ================================================================= Centro de custo

export function CostCenterDialog({ open, onOpenChange, center }: { open: boolean; onOpenChange: (o: boolean) => void; center?: CostCenterRow | null }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [resp, setResp] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const readOnly = center ? !can("fin_orcamento", "edit") : !can("fin_orcamento", "create");

  useEffect(() => {
    if (!open) return;
    setCode(center?.code ?? "");
    setName(center?.name ?? "");
    setResp(center?.responsible_id ?? null);
    setActive(center?.active ?? true);
  }, [open, center]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => persist("cost_centers", center, { code: code.trim().toUpperCase(), name: name.trim(), responsible_id: resp, active }),
      "Centro de custo salvo.",
      qc,
      setBusy,
    );
    if (ok) {
      void qc.invalidateQueries({ queryKey: ["cost_centers"] });
      onOpenChange(false);
    }
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={center ? `${center.code} · ${center.name}` : "Novo centro de custo"}
      formId="cc-form"
      isNew={!center}
      readOnly={readOnly}
      busy={busy}
      remove={center && can("fin_orcamento", "delete") ? { table: "cost_centers", id: center.id, label: center.name } : undefined}
      form={
        <form id="cc-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Código"><Input value={code} onChange={(e) => setCode(e.target.value)} required disabled={readOnly} placeholder="CC-EVT" /></Field>
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} required disabled={readOnly} /></Field>
          <Field label="Responsável"><PersonSelect value={resp} onChange={setResp} disabled={readOnly} /></Field>
          <Field label="Ativo"><div className="flex h-9 items-center"><Switch checked={active} onCheckedChange={setActive} disabled={readOnly} /></div></Field>
        </form>
      }
    />
  );
}

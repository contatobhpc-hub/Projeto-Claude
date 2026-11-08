// Cadastros de Parceiros, Contratos e Eventos.

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CampaignSelect, EnumSelect, Field, PeoplePicker, PersonSelect } from "@/components/ops/fields";
import { EntityDialog, useDraftSetter } from "@/components/ops/entity-dialog";
import { ListSelect, PartnerSelect, PartnersPicker } from "@/components/ops/rel-fields";
import type { ContractRow, EventRow, PartnerRow } from "@/integrations/supabase/types";
import { insertRow, moneyInput, orNull, parseMoney, updateRow, type LiveTable } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { PRIORITIES } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import { CONTRACT_STATUSES, EVENT_TYPES, MKT_EVENT_STATUSES, PARTNER_STATUSES, useAppLists } from "@/lib/relacionamento";

/** Salva (cria ou atualiza) e devolve a linha gravada. */
export async function persist<T extends { id: string }>(table: LiveTable, existing: { id: string } | null | undefined, values: Record<string, unknown>) {
  return existing ? updateRow<T>(table, existing.id, values) : insertRow<T>(table, values);
}

function money(label: string, value: string, onChange: (v: string) => void, disabled?: boolean) {
  return (
    <Field label={label}>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0,00" disabled={disabled} />
    </Field>
  );
}

function checkMoney(...values: number[]) {
  if (values.some((v) => Number.isNaN(v) || v < 0)) {
    toast.error("Confira os valores em reais (use vírgula para centavos).");
    return false;
  }
  return true;
}

// ================================================================= Parceiro

type PartnerDraft = {
  company: string; category: string; status: string; city: string; contact_name: string; phone: string; whatsapp: string;
  email: string; document: string; owner_id: string | null; counterparts: string; investment_month: string;
  expected_return: string; delivered_return: string; notes: string;
};

const partnerDraft = (p: PartnerRow | null | undefined, me: string | null): PartnerDraft => ({
  company: p?.company ?? "", category: p?.category ?? "Fornecedor", status: p?.status ?? "Prospect", city: p?.city ?? "",
  contact_name: p?.contact_name ?? "", phone: p?.phone ?? "", whatsapp: p?.whatsapp ?? "", email: p?.email ?? "",
  document: p?.document ?? "", owner_id: p ? p.owner_id : me, counterparts: p?.counterparts ?? "",
  investment_month: moneyInput(p?.investment_month), expected_return: moneyInput(p?.expected_return),
  delivered_return: moneyInput(p?.delivered_return), notes: p?.notes ?? "",
});

export function PartnerDialog({ open, onOpenChange, partner }: { open: boolean; onOpenChange: (o: boolean) => void; partner?: PartnerRow | null }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { profile, can } = usePermissions();
  const lists = useAppLists();
  const [d, setD] = useState(partnerDraft(partner, profile?.id ?? null));
  const set = useDraftSetter<PartnerDraft>(setD);
  const [busy, setBusy] = useState(false);
  const readOnly = partner ? !can("parceiros", "edit") : !can("parceiros", "create");

  useEffect(() => {
    if (open) setD(partnerDraft(partner, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partner?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const inv = parseMoney(d.investment_month), exp = parseMoney(d.expected_return), del = parseMoney(d.delivered_return);
    if (!checkMoney(inv, exp, del)) return;
    setBusy(true);
    try {
      const row = await persist<PartnerRow>("partners", partner, {
        company: d.company.trim(), category: d.category, status: d.status, city: d.city.trim(), contact_name: d.contact_name.trim(),
        phone: d.phone.trim(), whatsapp: d.whatsapp.trim(), email: d.email.trim(), document: d.document.trim(), owner_id: d.owner_id,
        counterparts: d.counterparts, investment_month: inv, expected_return: exp, delivered_return: del, notes: d.notes,
      });
      toast.success(partner ? "Parceiro salvo." : "Parceiro cadastrado.");
      void qc.invalidateQueries({ queryKey: ["partners"] });
      onOpenChange(false);
      if (!partner) void nav({ to: "/parceiros/$id", params: { id: row.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={partner ? "Editar parceiro" : "Novo parceiro"}
      formId="partner-form"
      isNew={!partner}
      readOnly={readOnly}
      busy={busy}
      form={
        <form id="partner-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Empresa" className="sm:col-span-2">
            <Input value={d.company} onChange={(e) => set("company", e.target.value)} required disabled={readOnly} autoFocus={!partner} />
          </Field>
          <Field label="Categoria"><ListSelect value={d.category} list={lists.partner_categories} onChange={(v) => set("category", v)} disabled={readOnly} /></Field>
          <Field label="Status"><EnumSelect value={d.status} options={PARTNER_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} /></Field>
          <Field label="Cidade"><Input value={d.city} onChange={(e) => set("city", e.target.value)} disabled={readOnly} /></Field>
          <Field label="CNPJ / CPF"><Input value={d.document} onChange={(e) => set("document", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Contato"><Input value={d.contact_name} onChange={(e) => set("contact_name", e.target.value)} disabled={readOnly} /></Field>
          <Field label="E-mail"><Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Telefone"><Input value={d.phone} onChange={(e) => set("phone", e.target.value)} disabled={readOnly} /></Field>
          <Field label="WhatsApp"><Input value={d.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Responsável interno" className="sm:col-span-2"><PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} disabled={readOnly} /></Field>
          {money("Investimento mensal (R$)", d.investment_month, (v) => set("investment_month", v), readOnly)}
          {money("Retorno esperado (R$)", d.expected_return, (v) => set("expected_return", v), readOnly)}
          {money("Retorno entregue (R$)", d.delivered_return, (v) => set("delivered_return", v), readOnly)}
          <Field label="Contrapartidas" className="sm:col-span-2">
            <Textarea value={d.counterparts} onChange={(e) => set("counterparts", e.target.value)} rows={2} disabled={readOnly} />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} />
          </Field>
        </form>
      }
    />
  );
}

// ================================================================= Contrato

type ContractDraft = {
  object: string; partner_id: string | null; company: string; category: string; status: string; value: string; cost_center: string;
  start_date: string; end_date: string; renewal_date: string; auto_renewal: boolean; owner_id: string | null;
  campaign_id: string | null; notes: string;
};

const contractDraft = (c: Partial<ContractRow> | null | undefined, me: string | null): ContractDraft => ({
  object: c?.object ?? "", partner_id: c?.partner_id ?? null, company: c?.company ?? "", category: c?.category ?? "Outros",
  status: c?.status ?? "Rascunho", value: moneyInput(c?.value), cost_center: c?.cost_center ?? "", start_date: c?.start_date ?? "",
  end_date: c?.end_date ?? "", renewal_date: c?.renewal_date ?? "", auto_renewal: c?.auto_renewal ?? false,
  owner_id: c?.id ? (c.owner_id ?? null) : (c?.owner_id ?? me), campaign_id: c?.campaign_id ?? null, notes: c?.notes ?? "",
});

export function ContractDialog({
  open,
  onOpenChange,
  contract,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contract?: ContractRow | null;
  defaults?: Partial<ContractRow>;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { profile, can } = usePermissions();
  const lists = useAppLists();
  const [d, setD] = useState(contractDraft(contract ?? defaults, profile?.id ?? null));
  const set = useDraftSetter<ContractDraft>(setD);
  const [busy, setBusy] = useState(false);
  const readOnly = contract ? !can("contratos", "edit") : !can("contratos", "create");

  useEffect(() => {
    if (open) setD(contractDraft(contract ?? defaults, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(d.value);
    if (!checkMoney(value)) return;
    if (d.start_date && d.end_date && d.end_date < d.start_date) return void toast.error("O fim não pode ser antes do início.");
    if (!d.partner_id && !d.company.trim()) return void toast.error("Escolha um parceiro ou informe o nome do contratado.");
    setBusy(true);
    try {
      const row = await persist<ContractRow>("contracts", contract, {
        object: d.object.trim(), partner_id: d.partner_id, company: d.company.trim(), category: d.category, status: d.status, value,
        cost_center: d.cost_center.trim(), start_date: orNull(d.start_date), end_date: orNull(d.end_date),
        renewal_date: orNull(d.renewal_date), auto_renewal: d.auto_renewal, owner_id: d.owner_id, campaign_id: d.campaign_id, notes: d.notes,
      });
      toast.success(contract ? "Contrato salvo." : "Contrato cadastrado.");
      void qc.invalidateQueries({ queryKey: ["contracts"] });
      onOpenChange(false);
      if (!contract) void nav({ to: "/contratos/$id", params: { id: row.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={contract ? "Editar contrato" : "Novo contrato"}
      description="O PDF assinado e demais documentos vão na aba Arquivos do contrato."
      formId="contract-form"
      isNew={!contract}
      readOnly={readOnly}
      busy={busy}
      form={
        <form id="contract-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Objeto do contrato" className="sm:col-span-2">
            <Input value={d.object} onChange={(e) => set("object", e.target.value)} required disabled={readOnly} autoFocus={!contract} placeholder="Ex.: Spots de rádio 2026" />
          </Field>
          <Field label="Parceiro"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={readOnly} /></Field>
          <Field label="Contratado (se não for parceiro)"><Input value={d.company} onChange={(e) => set("company", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Categoria"><ListSelect value={d.category} list={lists.contract_categories} onChange={(v) => set("category", v)} disabled={readOnly} /></Field>
          <Field label="Status"><EnumSelect value={d.status} options={CONTRACT_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} /></Field>
          {money("Valor total (R$)", d.value, (v) => set("value", v), readOnly)}
          <Field label="Centro de custo"><Input value={d.cost_center} onChange={(e) => set("cost_center", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Início"><Input type="date" value={d.start_date} onChange={(e) => set("start_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Fim (vencimento)"><Input type="date" value={d.end_date} min={d.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Data para renovar"><Input type="date" value={d.renewal_date} onChange={(e) => set("renewal_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Renovação automática">
            <div className="flex h-9 items-center"><Switch checked={d.auto_renewal} onCheckedChange={(v) => set("auto_renewal", v)} disabled={readOnly} /></div>
          </Field>
          <Field label="Responsável"><PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} disabled={readOnly} /></Field>
          <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} /></Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={3} disabled={readOnly} />
          </Field>
        </form>
      }
    />
  );
}

// ================================================================= Evento

type EventDraft = {
  name: string; type: string; status: string; priority: string; event_date: string; end_date: string; start_time: string;
  city: string; venue: string; agency: string; assignee_id: string | null; team_ids: string[]; partner_ids: string[];
  campaign_id: string | null; objective: string; description: string; budget: string; expected_audience: string; notes: string;
};

const eventDraft = (e: Partial<EventRow> | null | undefined, me: string | null): EventDraft => ({
  name: e?.name ?? "", type: e?.type ?? "Ação Externa", status: e?.status ?? "Planejamento", priority: e?.priority ?? "Média",
  event_date: e?.event_date ?? "", end_date: e?.end_date ?? "", start_time: e?.start_time?.slice(0, 5) ?? "", city: e?.city ?? "",
  venue: e?.venue ?? "", agency: e?.agency ?? "", assignee_id: e?.id ? (e.assignee_id ?? null) : (e?.assignee_id ?? me),
  team_ids: e?.team_ids ?? [], partner_ids: e?.partner_ids ?? [], campaign_id: e?.campaign_id ?? null, objective: e?.objective ?? "",
  description: e?.description ?? "", budget: moneyInput(e?.budget), expected_audience: e?.expected_audience ? String(e.expected_audience) : "",
  notes: e?.notes ?? "",
});

export function MktEventDialog({
  open,
  onOpenChange,
  event,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event?: EventRow | null;
  defaults?: Partial<EventRow>;
}) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { profile, can, canOwn } = usePermissions();
  const [d, setD] = useState(eventDraft(event ?? defaults, profile?.id ?? null));
  const set = useDraftSetter<EventDraft>(setD);
  const [busy, setBusy] = useState(false);
  const own = !!event && event.assignee_id === profile?.id && canOwn("eventos", "edit");
  const readOnly = event ? !(can("eventos", "edit") || own) : !can("eventos", "create");

  useEffect(() => {
    if (open) setD(eventDraft(event ?? defaults, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const budget = parseMoney(d.budget);
    if (!checkMoney(budget)) return;
    if (d.event_date && d.end_date && d.end_date < d.event_date) return void toast.error("O término não pode ser antes do início.");
    setBusy(true);
    try {
      const row = await persist<EventRow>("events", event, {
        name: d.name.trim(), type: d.type, status: d.status, priority: d.priority, event_date: orNull(d.event_date),
        end_date: orNull(d.end_date), start_time: orNull(d.start_time), city: d.city.trim(), venue: d.venue.trim(), agency: d.agency.trim(),
        assignee_id: d.assignee_id, team_ids: d.team_ids, partner_ids: d.partner_ids, campaign_id: d.campaign_id, objective: d.objective,
        description: d.description, budget, expected_audience: d.expected_audience ? Number(d.expected_audience) : null, notes: d.notes,
      });
      toast.success(event ? "Evento salvo." : "Evento criado.");
      void qc.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);
      if (!event) void nav({ to: "/eventos/$id", params: { id: row.id } });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "Editar evento" : "Novo evento"}
      description="Checklist, cronograma, convidados, fornecedores e brindes ficam na página do evento."
      formId="mkt-event-form"
      isNew={!event}
      readOnly={readOnly}
      busy={busy}
      wide
      form={
        <form id="mkt-event-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome do evento" className="sm:col-span-3">
            <Input value={d.name} onChange={(e) => set("name", e.target.value)} required disabled={readOnly} autoFocus={!event} />
          </Field>
          <Field label="Tipo"><EnumSelect value={d.type} options={EVENT_TYPES} onChange={(v) => set("type", v)} disabled={readOnly} /></Field>
          <Field label="Status"><EnumSelect value={d.status} options={MKT_EVENT_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} /></Field>
          <Field label="Prioridade"><EnumSelect value={d.priority} options={PRIORITIES} onChange={(v) => set("priority", v)} disabled={readOnly} /></Field>
          <Field label="Data"><Input type="date" value={d.event_date} onChange={(e) => set("event_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Até (opcional)"><Input type="date" value={d.end_date} min={d.event_date || undefined} onChange={(e) => set("end_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Horário"><Input type="time" value={d.start_time} onChange={(e) => set("start_time", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Cidade"><Input value={d.city} onChange={(e) => set("city", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Local"><Input value={d.venue} onChange={(e) => set("venue", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Agência"><Input value={d.agency} onChange={(e) => set("agency", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Responsável"><PersonSelect value={d.assignee_id} onChange={(v) => set("assignee_id", v)} disabled={readOnly} /></Field>
          <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} /></Field>
          {money("Orçamento (R$)", d.budget, (v) => set("budget", v), readOnly)}
          <Field label="Público esperado">
            <Input type="number" min={0} value={d.expected_audience} onChange={(e) => set("expected_audience", e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Equipe" className="sm:col-span-3"><PeoplePicker value={d.team_ids} onChange={(v) => set("team_ids", v)} disabled={readOnly} /></Field>
          <Field label="Parceiros envolvidos" className="sm:col-span-3"><PartnersPicker value={d.partner_ids} onChange={(v) => set("partner_ids", v)} disabled={readOnly} /></Field>
          <Field label="Objetivo" className="sm:col-span-3"><Input value={d.objective} onChange={(e) => set("objective", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Descrição" className="sm:col-span-3"><Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} disabled={readOnly} /></Field>
          <Field label="Observações" className="sm:col-span-3"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} /></Field>
        </form>
      }
    />
  );
}

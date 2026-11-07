// Cadastros de Patrocínios, Mídia Offline e Brindes (com movimentações de estoque).

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampaignSelect, EnumSelect, Field, PersonSelect, ProjectSelect } from "@/components/ops/fields";
import { EntityDialog, useDraftSetter } from "@/components/ops/entity-dialog";
import { RecordChecklist, RecordHistory } from "@/components/ops/record-panels";
import { ContractSelect, MktEventSelect, MultiChips, PartnerSelect } from "@/components/ops/rel-fields";
import { persist } from "@/components/ops/rel-dialogs";
import { RecordAttachments } from "@/components/record-attachments";
import { RecordComments } from "@/components/record-comments";
import { supabase } from "@/integrations/supabase/client";
import type { InventoryItemRow, InventoryMovementRow, OfflineMediaRow, SponsorshipRow } from "@/integrations/supabase/types";
import { moneyInput, orNull, parseMoney } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { brl } from "@/lib/operacao";
import { usePermissions } from "@/lib/permissions";
import {
  INVENTORY_CATEGORIES,
  MEDIA_STATUSES,
  MOVEMENT_TYPES,
  SPONSORSHIP_CATEGORIES,
  SPONSORSHIP_STATUSES,
  SPONSORSHIP_TIERS,
  tierFor,
  useAppLists,
  useInventory,
  useMktEvents,
  useMovements,
} from "@/lib/relacionamento";
import { profileName, useProfiles } from "@/lib/team";

const badMoney = (...v: number[]) => v.some((x) => Number.isNaN(x) || x < 0);

// ================================================================= Patrocínio

type SponsorDraft = {
  event_name: string; institution: string; city: string; category: string; tier: string; status: string; value: string;
  start_date: string; end_date: string; owner_id: string | null; partner_id: string | null; contract_id: string | null;
  event_id: string | null; campaign_id: string | null; materials_deadline: string; counterparts_deadline: string;
  accounting_deadline: string; report_summary: string; expected_return: string; delivered_return: string; notes: string;
};

const sponsorDraft = (s: Partial<SponsorshipRow> | null | undefined, me: string | null): SponsorDraft => ({
  event_name: s?.event_name ?? "", institution: s?.institution ?? "", city: s?.city ?? "", category: s?.category ?? "Social",
  tier: s?.tier ?? "Apoio", status: s?.status ?? "Em negociação", value: moneyInput(s?.value), start_date: s?.start_date ?? "",
  end_date: s?.end_date ?? "", owner_id: s?.id ? (s.owner_id ?? null) : (s?.owner_id ?? me), partner_id: s?.partner_id ?? null,
  contract_id: s?.contract_id ?? null, event_id: s?.event_id ?? null, campaign_id: s?.campaign_id ?? null,
  materials_deadline: s?.materials_deadline ?? "", counterparts_deadline: s?.counterparts_deadline ?? "",
  accounting_deadline: s?.accounting_deadline ?? "", report_summary: s?.report_summary ?? "",
  expected_return: moneyInput(s?.expected_return), delivered_return: moneyInput(s?.delivered_return), notes: s?.notes ?? "",
});

export function SponsorshipDialog({
  open,
  onOpenChange,
  sponsorship,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sponsorship?: SponsorshipRow | null;
  defaults?: Partial<SponsorshipRow>;
}) {
  const qc = useQueryClient();
  const { profile, can } = usePermissions();
  const [d, setD] = useState(sponsorDraft(sponsorship ?? defaults, profile?.id ?? null));
  const set = useDraftSetter<SponsorDraft>(setD);
  const [busy, setBusy] = useState(false);
  const isNew = !sponsorship;
  const readOnly = isNew ? !can("patrocinios", "create") : !can("patrocinios", "edit");

  useEffect(() => {
    if (open) setD(sponsorDraft(sponsorship ?? defaults, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sponsorship?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(d.value), exp = parseMoney(d.expected_return), del = parseMoney(d.delivered_return);
    if (badMoney(value, exp, del)) return void toast.error("Confira os valores em reais.");
    if (d.start_date && d.end_date && d.end_date < d.start_date) return void toast.error("O fim não pode ser antes do início.");
    setBusy(true);
    try {
      await persist<SponsorshipRow>("sponsorships", sponsorship, {
        event_name: d.event_name.trim(), institution: d.institution.trim(), city: d.city.trim(), category: d.category, tier: d.tier,
        status: d.status, value, start_date: orNull(d.start_date), end_date: orNull(d.end_date), owner_id: d.owner_id,
        partner_id: d.partner_id, contract_id: d.contract_id, event_id: d.event_id, campaign_id: d.campaign_id,
        materials_deadline: orNull(d.materials_deadline), counterparts_deadline: orNull(d.counterparts_deadline),
        accounting_deadline: orNull(d.accounting_deadline), report_summary: d.report_summary, expected_return: exp,
        delivered_return: del, notes: d.notes,
      });
      toast.success(isNew ? "Patrocínio cadastrado." : "Patrocínio salvo.");
      void qc.invalidateQueries({ queryKey: ["sponsorships"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const id = sponsorship?.id;
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Novo patrocínio" : sponsorship!.event_name}
      description={isNew ? undefined : sponsorship!.institution}
      formId="sponsor-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      wide
      remove={id && can("patrocinios", "delete") ? { table: "sponsorships", id, label: sponsorship!.event_name } : undefined}
      tabs={
        id
          ? [
              { value: "contrapartidas", label: "Contrapartidas", content: <RecordChecklist module="patrocinios" recordId={id} canEdit={!readOnly} group="Contrapartidas" title="Contrapartidas combinadas" /> },
              { value: "arquivos", label: "Arquivos", content: <RecordAttachments module="patrocinios" recordId={id} /> },
              { value: "comentarios", label: "Comentários", content: <RecordComments module="patrocinios" recordId={id} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="sponsorships" recordId={id} /> },
            ]
          : []
      }
      form={
        <form id="sponsor-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Evento / ação patrocinada" className="sm:col-span-2">
            <Input value={d.event_name} onChange={(e) => set("event_name", e.target.value)} required disabled={readOnly} autoFocus={isNew} />
          </Field>
          <Field label="Cidade"><Input value={d.city} onChange={(e) => set("city", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Instituição / organizador" className="sm:col-span-2">
            <Input value={d.institution} onChange={(e) => set("institution", e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Categoria"><EnumSelect value={d.category} options={SPONSORSHIP_CATEGORIES} onChange={(v) => set("category", v)} disabled={readOnly} /></Field>
          <Field label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={d.value}
              disabled={readOnly}
              onChange={(e) => set("value", e.target.value)}
              onBlur={() => isNew && set("tier", tierFor(parseMoney(d.value) || 0))}
            />
          </Field>
          <Field label="Cota" hint="Sugerida pelo valor; pode trocar."><EnumSelect value={d.tier} options={SPONSORSHIP_TIERS} onChange={(v) => set("tier", v)} disabled={readOnly} /></Field>
          <Field label="Status"><EnumSelect value={d.status} options={SPONSORSHIP_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} /></Field>
          <Field label="Início"><Input type="date" value={d.start_date} onChange={(e) => set("start_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Fim"><Input type="date" value={d.end_date} min={d.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Responsável"><PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} disabled={readOnly} /></Field>
          <Field label="Prazo dos materiais"><Input type="date" value={d.materials_deadline} onChange={(e) => set("materials_deadline", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Prazo das contrapartidas"><Input type="date" value={d.counterparts_deadline} onChange={(e) => set("counterparts_deadline", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Prestação de contas"><Input type="date" value={d.accounting_deadline} onChange={(e) => set("accounting_deadline", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Parceiro"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={readOnly} /></Field>
          <Field label="Contrato"><ContractSelect value={d.contract_id} onChange={(v) => set("contract_id", v)} disabled={readOnly} /></Field>
          <Field label="Evento"><MktEventSelect value={d.event_id} onChange={(v) => set("event_id", v)} disabled={readOnly} /></Field>
          <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} /></Field>
          <Field label="Retorno esperado (R$)"><Input inputMode="decimal" value={d.expected_return} onChange={(e) => set("expected_return", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Retorno entregue (R$)"><Input inputMode="decimal" value={d.delivered_return} onChange={(e) => set("delivered_return", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Relatório / resultado" className="sm:col-span-3">
            <Textarea value={d.report_summary} onChange={(e) => set("report_summary", e.target.value)} rows={2} disabled={readOnly} />
          </Field>
          <Field label="Observações" className="sm:col-span-3">
            <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} />
          </Field>
        </form>
      }
    />
  );
}

// ================================================================= Mídia offline

type MediaDraft = {
  title: string; categories: string[]; status: string; city: string; location: string; supplier: string; partner_id: string | null;
  campaign_id: string | null; project_id: string | null; install_date: string; removal_date: string; owner_id: string | null;
  value: string; cost_center: string; notes: string;
};

const mediaDraft = (m: Partial<OfflineMediaRow> | null | undefined, me: string | null): MediaDraft => ({
  title: m?.title ?? "", categories: m?.categories ?? [], status: m?.status ?? "Planejado", city: m?.city ?? "",
  location: m?.location ?? "", supplier: m?.supplier ?? "", partner_id: m?.partner_id ?? null, campaign_id: m?.campaign_id ?? null,
  project_id: m?.project_id ?? null, install_date: m?.install_date ?? "", removal_date: m?.removal_date ?? "",
  owner_id: m?.id ? (m.owner_id ?? null) : (m?.owner_id ?? me), value: moneyInput(m?.value), cost_center: m?.cost_center ?? "",
  notes: m?.notes ?? "",
});

export function MediaDialog({
  open,
  onOpenChange,
  media,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  media?: OfflineMediaRow | null;
  defaults?: Partial<OfflineMediaRow>;
}) {
  const qc = useQueryClient();
  const { profile, can } = usePermissions();
  const lists = useAppLists();
  const [d, setD] = useState(mediaDraft(media ?? defaults, profile?.id ?? null));
  const set = useDraftSetter<MediaDraft>(setD);
  const [busy, setBusy] = useState(false);
  const isNew = !media;
  const readOnly = isNew ? !can("midia", "create") : !can("midia", "edit");

  useEffect(() => {
    if (open) setD(mediaDraft(media ?? defaults, profile?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, media?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(d.value);
    if (badMoney(value)) return void toast.error("Valor inválido.");
    if (d.install_date && d.removal_date && d.removal_date < d.install_date) return void toast.error("A retirada não pode ser antes da instalação.");
    setBusy(true);
    try {
      await persist<OfflineMediaRow>("offline_media", media, {
        title: d.title.trim(), categories: d.categories, status: d.status, city: d.city.trim(), location: d.location.trim(),
        supplier: d.supplier.trim(), partner_id: d.partner_id, campaign_id: d.campaign_id, project_id: d.project_id,
        install_date: orNull(d.install_date), removal_date: orNull(d.removal_date), owner_id: d.owner_id, value,
        cost_center: d.cost_center.trim(), notes: d.notes,
      });
      toast.success(isNew ? "Mídia cadastrada." : "Mídia salva.");
      void qc.invalidateQueries({ queryKey: ["offline_media"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const id = media?.id;
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Nova mídia" : media!.title}
      formId="media-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      remove={id && can("midia", "delete") ? { table: "offline_media", id, label: media!.title } : undefined}
      tabs={
        id
          ? [
              { value: "arquivos", label: "Arte e fotos", content: <RecordAttachments module="midia" recordId={id} /> },
              { value: "comentarios", label: "Comentários", content: <RecordComments module="midia" recordId={id} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="offline_media" recordId={id} /> },
            ]
          : []
      }
      form={
        <form id="media-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Título" className="sm:col-span-2">
            <Input value={d.title} onChange={(e) => set("title", e.target.value)} required disabled={readOnly} autoFocus={isNew} placeholder="Ex.: Outdoor Av. Brasil — Dia C" />
          </Field>
          <Field label="Formatos" className="sm:col-span-2"><MultiChips value={d.categories} options={lists.media_categories} onChange={(v) => set("categories", v)} disabled={readOnly} /></Field>
          <Field label="Status"><EnumSelect value={d.status} options={MEDIA_STATUSES} onChange={(v) => set("status", v)} disabled={readOnly} /></Field>
          <Field label="Responsável"><PersonSelect value={d.owner_id} onChange={(v) => set("owner_id", v)} disabled={readOnly} /></Field>
          <Field label="Cidade"><Input value={d.city} onChange={(e) => set("city", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Localização / endereço"><Input value={d.location} onChange={(e) => set("location", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Instalação"><Input type="date" value={d.install_date} onChange={(e) => set("install_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Retirada"><Input type="date" value={d.removal_date} min={d.install_date || undefined} onChange={(e) => set("removal_date", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Fornecedor"><Input value={d.supplier} onChange={(e) => set("supplier", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Parceiro cadastrado"><PartnerSelect value={d.partner_id} onChange={(v) => set("partner_id", v)} disabled={readOnly} /></Field>
          <Field label="Valor (R$)"><Input inputMode="decimal" value={d.value} onChange={(e) => set("value", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Centro de custo"><Input value={d.cost_center} onChange={(e) => set("cost_center", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Campanha"><CampaignSelect value={d.campaign_id} onChange={(v) => set("campaign_id", v)} disabled={readOnly} /></Field>
          <Field label="Projeto"><ProjectSelect value={d.project_id} onChange={(v) => set("project_id", v)} campaignId={d.campaign_id} disabled={readOnly} /></Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} /></Field>
        </form>
      }
    />
  );
}

// ================================================================= Brindes

type ItemDraft = {
  code: string; name: string; category: string; supplier: string; location: string; unit_value: string; min_quantity: string;
  notes: string; initial: string;
};

const itemDraft = (i: InventoryItemRow | null | undefined): ItemDraft => ({
  code: i?.code ?? "", name: i?.name ?? "", category: i?.category ?? "Outros", supplier: i?.supplier ?? "", location: i?.location ?? "",
  unit_value: moneyInput(i?.unit_value), min_quantity: i ? String(i.min_quantity) : "0", notes: i?.notes ?? "", initial: "",
});

export function InventoryItemDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: InventoryItemRow | null }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [d, setD] = useState(itemDraft(item));
  const set = useDraftSetter<ItemDraft>(setD);
  const [busy, setBusy] = useState(false);
  const isNew = !item;
  const readOnly = isNew ? !can("brindes", "create") : !can("brindes", "edit");

  useEffect(() => {
    if (open) setD(itemDraft(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const unit = parseMoney(d.unit_value);
    const min = Number(d.min_quantity || 0);
    const initial = Number(d.initial || 0);
    if (badMoney(unit) || !Number.isInteger(min) || min < 0 || !Number.isInteger(initial) || initial < 0) {
      return void toast.error("Confira valor, estoque mínimo e quantidade inicial (números inteiros).");
    }
    setBusy(true);
    try {
      const row = await persist<InventoryItemRow>("inventory_items", item, {
        code: d.code.trim(), name: d.name.trim(), category: d.category, supplier: d.supplier.trim(), location: d.location.trim(),
        unit_value: unit, min_quantity: min, notes: d.notes,
      });
      if (isNew && initial > 0) {
        const { error } = await supabase
          .from("inventory_movements")
          .insert({ item_id: row.id, type: "Entrada", quantity: initial, reason: "Estoque inicial" });
        if (error) throw error;
      }
      toast.success(isNew ? "Brinde cadastrado." : "Brinde salvo.");
      void qc.invalidateQueries({ queryKey: ["inventory_items"] });
      void qc.invalidateQueries({ queryKey: ["inventory_movements"] });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const id = item?.id;
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "Novo brinde" : item!.name}
      description={isNew ? "O saldo muda só por movimentações (entrada, saída, reserva, inventário)." : undefined}
      formId="item-form"
      isNew={isNew}
      readOnly={readOnly}
      busy={busy}
      wide
      remove={id && can("brindes", "delete") ? { table: "inventory_items", id, label: item!.name } : undefined}
      tabs={
        id
          ? [
              { value: "movimentos", label: "Movimentações", content: <MovementsPanel itemId={id} /> },
              { value: "fotos", label: "Fotos", content: <RecordAttachments module="brindes" recordId={id} /> },
              { value: "historico", label: "Histórico", content: <RecordHistory table="inventory_items" recordId={id} /> },
            ]
          : []
      }
      form={
        <form id="item-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome" className="sm:col-span-2">
            <Input value={d.name} onChange={(e) => set("name", e.target.value)} required disabled={readOnly} autoFocus={isNew} />
          </Field>
          <Field label="Código interno"><Input value={d.code} onChange={(e) => set("code", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Categoria"><EnumSelect value={d.category} options={INVENTORY_CATEGORIES} onChange={(v) => set("category", v)} disabled={readOnly} /></Field>
          <Field label="Fornecedor"><Input value={d.supplier} onChange={(e) => set("supplier", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Local de guarda"><Input value={d.location} onChange={(e) => set("location", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Valor unitário (R$)"><Input inputMode="decimal" value={d.unit_value} onChange={(e) => set("unit_value", e.target.value)} disabled={readOnly} /></Field>
          <Field label="Estoque mínimo" hint="Abaixo disso, aparece o alerta."><Input type="number" min={0} value={d.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} disabled={readOnly} /></Field>
          {isNew && (
            <Field label="Quantidade inicial"><Input type="number" min={0} value={d.initial} onChange={(e) => set("initial", e.target.value)} disabled={readOnly} /></Field>
          )}
          {!isNew && (
            <Field label="Saldo atual">
              <div className="flex h-9 items-center text-sm tabular-nums">
                {item!.quantity} un. ({item!.reserved} reservadas)
              </div>
            </Field>
          )}
          <Field label="Observações" className="sm:col-span-3"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} disabled={readOnly} /></Field>
        </form>
      }
    />
  );
}

const MOVE_HELP: Record<string, string> = {
  Entrada: "Compra ou recebimento: soma ao saldo.",
  Saída: "Entrega para evento, ação ou pessoa: diminui o saldo.",
  Reserva: "Separa unidades para um evento sem tirar do estoque.",
  Liberação: "Devolve unidades reservadas para o disponível.",
  Inventário: "Contagem física: o saldo passa a ser o número contado.",
};

/** Formulário de movimentação. Com `itemId` fixo (tela do item) ou escolhendo o item (tela do evento). */
export function MovementForm({ itemId, eventId, onDone }: { itemId?: string; eventId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useInventory();
  const { data: events = [] } = useMktEvents();
  const [item, setItem] = useState(itemId ?? "");
  const [type, setType] = useState<string>(eventId ? "Saída" : "Entrada");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [event, setEvent] = useState<string | null>(eventId ?? null);
  const [fromReserve, setFromReserve] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = items.find((i) => i.id === item);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!item) return void toast.error("Escolha o brinde.");
    if (!Number.isInteger(n) || n < 0 || (type !== "Inventário" && n === 0)) return void toast.error("Quantidade inválida.");
    setBusy(true);
    const { error } = await supabase.from("inventory_movements").insert({
      item_id: item, type: type as InventoryMovementRow["type"], quantity: n, reason: reason.trim(), destination: destination.trim(),
      event_id: event, from_reserve: type === "Saída" && fromReserve,
    });
    setBusy(false);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Movimentação registrada.");
    setQty("");
    setReason("");
    setDestination("");
    void qc.invalidateQueries({ queryKey: ["inventory_items"] });
    void qc.invalidateQueries({ queryKey: ["inventory_movements"] });
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-4">
      {!itemId && (
        <Field label="Brinde" className="sm:col-span-2">
          <Select value={item} onValueChange={setItem}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} ({i.quantity - i.reserved} disp.)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label="Tipo" hint={MOVE_HELP[type]} className={itemId ? "sm:col-span-2" : ""}>
        <EnumSelect value={type} options={MOVEMENT_TYPES} onChange={setType} />
      </Field>
      <Field label={type === "Inventário" ? "Quantidade contada" : "Quantidade"}>
        <Input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} required />
      </Field>
      {itemId && selected && (
        <Field label="Disponível agora">
          <div className="flex h-9 items-center text-sm tabular-nums">
            {selected.quantity - selected.reserved} ({selected.reserved} reserv.)
          </div>
        </Field>
      )}
      {!eventId && (type === "Saída" || type === "Reserva" || type === "Liberação") && (
        <Field label="Evento (opcional)" className="sm:col-span-2">
          <Select value={event ?? "__none__"} onValueChange={(v) => setEvent(v === "__none__" ? null : v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem evento</SelectItem>
              {events.map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      {type === "Saída" && (
        <Field label="Destino" className="sm:col-span-2"><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Para quem / onde" /></Field>
      )}
      <Field label="Motivo" className="sm:col-span-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {type === "Saída" && (
        <Field label="Usar unidades reservadas">
          <div className="flex h-9 items-center"><Switch checked={fromReserve} onCheckedChange={setFromReserve} /></div>
        </Field>
      )}
      <div className="flex items-end sm:col-span-4">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Registrar
        </Button>
      </div>
    </form>
  );
}

export function MovementsPanel({ itemId, eventId }: { itemId?: string; eventId?: string }) {
  const { can } = usePermissions();
  const { data: rows = [], isLoading } = useMovements({ item_id: itemId, event_id: eventId });
  const { data: items = [] } = useInventory();
  const { data: profiles } = useProfiles();
  const canMove = can("brindes", "edit") || can("brindes", "create");
  const name = (id: string) => items.find((i) => i.id === id)?.name ?? "Item removido";

  const out = rows.filter((r) => r.type === "Saída").reduce((s, r) => s + r.quantity, 0);
  const value = rows
    .filter((r) => r.type === "Saída")
    .reduce((s, r) => s + r.quantity * Number(items.find((i) => i.id === r.item_id)?.unit_value ?? 0), 0);

  return (
    <div className="space-y-3">
      {canMove && <MovementForm itemId={itemId} eventId={eventId} />}
      {eventId && rows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {out} unidades entregues neste evento · {brl(value)} em brindes
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma movimentação.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className={`w-24 shrink-0 font-medium ${r.delta < 0 ? "text-red-500" : r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {r.type}
              </span>
              <span className="w-16 shrink-0 tabular-nums">
                {r.type === "Inventário" ? `= ${r.quantity}` : r.quantity}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {!itemId && <strong className="font-medium text-foreground">{name(r.item_id)} · </strong>}
                {[r.reason, r.destination].filter(Boolean).join(" · ") || "—"}
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {profileName(profiles, r.created_by)} · {format(new Date(r.created_at), "dd/MM/yy HH:mm")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

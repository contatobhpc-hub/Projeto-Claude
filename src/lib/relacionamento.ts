// Fase 3 — Relacionamento e materiais: valores, alertas e consultas.

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  ContractRow,
  EventRow,
  InventoryItemRow,
  InventoryMovementRow,
  OfflineMediaRow,
  PartnerRow,
  SponsorshipRow,
} from "@/integrations/supabase/types";
import { useLiveTable, useRow, useRows, type RowFilter } from "@/lib/data";
import { todayISO } from "@/lib/operacao";

// ----------------------------------------------------------------- Valores

export const PARTNER_STATUSES = ["Prospect", "Negociação", "Ativo", "Renovação", "Inativo"] as const;
export const CONTRACT_STATUSES = ["Rascunho", "Em análise", "Assinado", "Vigente", "Renovação", "Encerrado", "Cancelado"] as const;
export const EVENT_TYPES = ["Lançamento", "Assembleia", "Feira", "Patrocínio", "Ação Externa", "Treinamento", "Workshop", "Confraternização", "Inauguração"] as const;
export const MKT_EVENT_STATUSES = ["Planejamento", "Em produção", "Confirmado", "Em andamento", "Concluído", "Cancelado"] as const;
export const EVENT_CHECKLIST_GROUPS = ["Arte", "Banner", "Convite", "Coffee", "Brindes", "Lista", "Fotografia", "Vídeo", "Publicação", "Pós-evento"] as const;
export const SPONSORSHIP_CATEGORIES = ["Esportivo", "Cultural", "Social", "Educacional", "Agronegócio", "Religioso", "Empresarial"] as const;
export const SPONSORSHIP_TIERS = ["Master", "Ouro", "Prata", "Bronze", "Apoio", "Permuta"] as const;
export const SPONSORSHIP_STATUSES = ["Em negociação", "Confirmado", "Em execução", "Concluído", "Cancelado"] as const;
export const MEDIA_STATUSES = ["Planejado", "Arte em produção", "Aguardando instalação", "Instalado", "Retirado", "Cancelado"] as const;
export const INVENTORY_CATEGORIES = [
  "Vestuário", "Papelaria", "Tecnologia", "Bebidas", "Alimentos", "Acessórios", "Decoração", "Material gráfico", "Kits institucionais", "Outros",
] as const;
export const MOVEMENT_TYPES = ["Entrada", "Saída", "Reserva", "Liberação", "Inventário"] as const;

/** Faixa sugerida pelo valor (mesma regra do app antigo). */
export function tierFor(value: number) {
  if (value >= 8000) return "Master";
  if (value >= 3000) return "Ouro";
  if (value >= 1500) return "Prata";
  if (value >= 500) return "Bronze";
  if (value > 0) return "Apoio";
  return "Permuta";
}

// ----------------------------------------------------------------- Prazos e alertas

/** Dias de hoje até a data (negativo = já passou). */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const a = new Date(`${todayISO()}T12:00:00`).getTime();
  const b = new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type AlertLevel = "expired" | "critical" | "warning" | "soon" | "ok" | "none";

export const ALERT_TONE: Record<AlertLevel, string> = {
  expired: "bg-red-500/15 text-red-600 dark:text-red-300",
  critical: "bg-red-500/15 text-red-600 dark:text-red-300",
  warning: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  soon: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  none: "bg-muted text-muted-foreground",
};

/** Alerta de vencimento de contrato (90, 30, 7 dias), só para contratos ativos. */
export function contractAlert(c: Pick<ContractRow, "end_date" | "status">): { level: AlertLevel; label: string; days: number | null } {
  if (["Encerrado", "Cancelado"].includes(c.status)) return { level: "none", label: c.status, days: null };
  const d = daysUntil(c.end_date);
  if (d === null) return { level: "none", label: "Sem vencimento", days: null };
  if (d < 0) return { level: "expired", label: `Vencido há ${-d} dia${d === -1 ? "" : "s"}`, days: d };
  if (d === 0) return { level: "critical", label: "Vence hoje", days: d };
  if (d <= 7) return { level: "critical", label: `Vence em ${d} dia${d === 1 ? "" : "s"}`, days: d };
  if (d <= 30) return { level: "warning", label: `Vence em ${d} dias`, days: d };
  if (d <= 90) return { level: "soon", label: `Vence em ${d} dias`, days: d };
  return { level: "ok", label: `Vence em ${d} dias`, days: d };
}

/** Alerta de retirada de mídia instalada. */
export function removalAlert(m: Pick<OfflineMediaRow, "removal_date" | "status">): { level: AlertLevel; label: string } {
  if (["Retirado", "Cancelado"].includes(m.status)) return { level: "none", label: "" };
  const d = daysUntil(m.removal_date);
  if (d === null) return { level: "none", label: "" };
  if (d < 0) return { level: "expired", label: `Retirada atrasada ${-d} dia${d === -1 ? "" : "s"}` };
  if (d <= 2) return { level: "critical", label: d === 0 ? "Retirar hoje" : `Retirar em ${d} dia${d === 1 ? "" : "s"}` };
  if (d <= 7) return { level: "soon", label: `Retirar em ${d} dias` };
  return { level: "none", label: "" };
}

export type StockLevel = "out" | "low" | "ok";
export function stockLevel(i: Pick<InventoryItemRow, "quantity" | "reserved" | "min_quantity">): StockLevel {
  const available = i.quantity - i.reserved;
  if (available <= 0) return "out";
  if (available <= i.min_quantity) return "low";
  return "ok";
}

/** Próximo prazo pendente do patrocínio (materiais, contrapartidas, prestação de contas). */
export function nextSponsorshipDeadline(s: SponsorshipRow): { label: string; date: string; days: number } | null {
  if (["Concluído", "Cancelado"].includes(s.status)) return null;
  const list = [
    { label: "Materiais", date: s.materials_deadline },
    { label: "Contrapartidas", date: s.counterparts_deadline },
    { label: "Prestação de contas", date: s.accounting_deadline },
  ]
    .filter((x): x is { label: string; date: string } => !!x.date)
    .map((x) => ({ ...x, days: daysUntil(x.date)! }))
    .sort((a, b) => a.days - b.days);
  return list.find((x) => x.days >= -30) ?? null;
}

// ----------------------------------------------------------------- Consultas

export const usePartners = () => useRows<PartnerRow>("partners", { order: "company", ascending: true });
export const usePartner = (id: string) => useRow<PartnerRow>("partners", id);

export const useContracts = (filters: RowFilter[] = []) => useRows<ContractRow>("contracts", { filters, order: "end_date", ascending: true });
export const useContract = (id: string) => useRow<ContractRow>("contracts", id);

export const useMktEvents = (filters: RowFilter[] = []) => useRows<EventRow>("events", { filters, order: "event_date", ascending: true });
export const useMktEvent = (id: string) => useRow<EventRow>("events", id);

export const useSponsorships = (filters: RowFilter[] = []) => useRows<SponsorshipRow>("sponsorships", { filters, order: "start_date", ascending: true });

export const useOfflineMedia = (filters: RowFilter[] = []) => useRows<OfflineMediaRow>("offline_media", { filters, order: "install_date", ascending: false });

export const useInventory = () => useRows<InventoryItemRow>("inventory_items", { order: "name", ascending: true });

export function useMovements(filter: { item_id?: string; event_id?: string }) {
  useLiveTable("inventory_movements");
  return useQuery({
    queryKey: ["inventory_movements", filter],
    enabled: !!(filter.item_id || filter.event_id),
    queryFn: async () => {
      let q = supabase.from("inventory_movements").select("*");
      if (filter.item_id) q = q.eq("item_id", filter.item_id);
      if (filter.event_id) q = q.eq("event_id", filter.event_id);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as InventoryMovementRow[];
    },
  });
}

// ----------------------------------------------------------------- Listas configuráveis

export type AppLists = { partner_categories: string[]; contract_categories: string[]; media_categories: string[] };

const DEFAULT_LISTS: AppLists = {
  partner_categories: ["Agência", "Fornecedor", "Patrocinador", "Mídia", "Rádio", "Gráfica", "Brindes", "Eventos", "Tecnologia", "Consultoria"],
  contract_categories: ["Agência", "Mídia", "Patrocínio", "Fornecedor", "Gráfica", "Tecnologia", "Eventos", "Consultoria", "Outros"],
  media_categories: ["Outdoor", "Painel LED", "TV", "Faixa", "Banner", "Cartaz", "Folder", "Busdoor", "Backdrop", "Relógio Digital"],
};

export function useAppSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
    },
  });
}

export function useAppLists(): AppLists {
  const { data } = useAppSettings();
  const lists = (data?.lists ?? {}) as Partial<AppLists>;
  return {
    partner_categories: lists.partner_categories?.length ? lists.partner_categories : DEFAULT_LISTS.partner_categories,
    contract_categories: lists.contract_categories?.length ? lists.contract_categories : DEFAULT_LISTS.contract_categories,
    media_categories: lists.media_categories?.length ? lists.media_categories : DEFAULT_LISTS.media_categories,
  };
}

/** Verba anual de patrocínios (por ano), configurada pelo Administrador. */
export function useSponsorshipBudget(): Record<string, number> {
  const { data } = useAppSettings();
  const raw = (data?.sponsorship_budget ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v) || 0]));
}

/** Garante que o valor atual apareça na lista mesmo se a categoria foi removida da configuração. */
export const withCurrent = (list: string[], current: string | null | undefined) =>
  current && !list.includes(current) ? [...list, current] : list;

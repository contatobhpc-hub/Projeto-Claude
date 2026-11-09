// Fase 2 — Operação: listas de valores e consultas de Campanhas, Projetos,
// Tarefas, Calendário e Conteúdos.

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  CalendarEventRow,
  CampaignRow,
  ChecklistItemRow,
  ContentItemRow,
  ContentVersionRow,
  ProjectRow,
  RecordHistoryRow,
  TaskRow,
} from "@/integrations/supabase/types";
import { useLiveTable } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";

// ----------------------------------------------------------------- Valores

export const PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"] as const;

export const CAMPAIGN_TYPES = ["Institucional", "Produto", "Sazonal", "Lançamento", "Endomarketing", "Patrocínio", "Performance"] as const;
export const CAMPAIGN_OBJECTIVES = ["Awareness", "Geração de leads", "Conversão", "Engajamento", "Relacionamento", "Educação"] as const;
export const CAMPAIGN_STATUSES = ["Rascunho", "Planejamento", "Em andamento", "Pausada", "Concluída", "Cancelada"] as const;

export const PROJECT_STATUSES = ["Backlog", "Em andamento", "Em revisão", "Bloqueado", "Concluído"] as const;

export const TASK_STATUSES = ["Backlog", "Planejamento", "Em andamento", "Aguardando Aprovação", "Concluído", "Cancelado"] as const;

export const EVENT_CATEGORIES = [
  "Campanha", "Evento", "Publicação", "Reunião", "Entrega", "Prazo", "Contrato",
  "Patrocínio", "Outdoor", "Rádio", "Produção de vídeo", "Aprovação",
] as const;
export const EVENT_STATUSES = ["Planejado", "Em andamento", "Concluído", "Atrasado", "Cancelado"] as const;

export const CONTENT_CATEGORIES = [
  "Legendas", "Matérias", "Roteiros", "Spot Rádio", "E-mails", "Comunicados", "Vídeos",
  "Stories", "Reels", "Campanhas", "Templates", "Arquivos Institucionais",
] as const;
export const CONTENT_STATUSES = ["Rascunho", "Em revisão", "Aguardando aprovação", "Aprovado", "Publicado", "Arquivado"] as const;

/** Cores por valor (status, prioridade, categoria). Classes Tailwind de fundo + texto. */
const TONE = {
  gray: "bg-muted text-muted-foreground",
  // Identidade Sicoob: em andamento = turquesa, concluído = roxo, planejado = cinza-esverdeado
  active: "bg-[#ddf4f1] text-[#00574f] dark:bg-[#00ae9d]/20 dark:text-[#7fe0d5]",
  done: "bg-[#ecebf7] text-[#3b3985] dark:bg-[#49479d]/30 dark:text-[#c4c3f0]",
  planned: "bg-[#eaefee] text-[#3e5357] dark:bg-white/10 dark:text-[#c9dcdc]",
  wait: "bg-[#fdf0dc] text-[#7a4a00] dark:bg-amber-500/20 dark:text-amber-200",
  bad: "bg-[#fbe3de] text-[#a2341f] dark:bg-red-500/20 dark:text-red-200",
  blue: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  red: "bg-red-500/15 text-red-600 dark:text-red-300",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  yellow: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-200",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
  lime: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
} as const;

const TONES: Record<string, string> = {
  // prioridades
  Baixa: TONE.planned, Média: TONE.blue, Alta: TONE.orange, Crítica: TONE.bad,
  // status genéricos
  Rascunho: TONE.gray, Planejamento: TONE.planned, Planejado: TONE.planned, Backlog: TONE.gray, Programada: TONE.planned,
  "Em andamento": TONE.active, "No ar": TONE.active, "Em revisão": TONE.wait, "Aguardando Aprovação": TONE.wait,
  "Aguardando aprovação": TONE.wait, Aguardando: TONE.wait, Pausada: TONE.wait, Bloqueado: TONE.bad,
  Atrasado: TONE.bad, Atrasada: TONE.bad, Concluída: TONE.done, Concluído: TONE.done, Aprovado: TONE.active, Aprovada: TONE.active,
  Publicado: TONE.done, Arquivado: TONE.gray, Cancelada: TONE.gray, Cancelado: TONE.gray,
  Reprovada: TONE.bad, "Não solicitada": TONE.gray,
  // parceiros, contratos, eventos, patrocínios, mídia
  Prospect: TONE.planned, Negociação: TONE.wait, Ativo: TONE.active, Renovação: TONE.wait, Inativo: TONE.gray,
  "Em análise": TONE.wait, Assinado: TONE.active, Vigente: TONE.active, Encerrado: TONE.done,
  "Em produção": TONE.active, Confirmado: TONE.active, "Em negociação": TONE.wait, "Em execução": TONE.active,
  // financeiro
  Pendente: TONE.wait, Paga: TONE.done, Pago: TONE.done, Comprado: TONE.active, Recebido: TONE.done, Recusado: TONE.bad, Agendado: TONE.planned,
  Solicitado: TONE.wait, "Em aprovação": TONE.wait, Urgente: TONE.bad,
  "Arte em produção": TONE.active, "Aguardando instalação": TONE.wait, Instalado: TONE.active, Retirado: TONE.done,
  // categorias do calendário
  Campanha: TONE.indigo, Evento: TONE.pink, Publicação: TONE.blue, Reunião: TONE.violet, Entrega: TONE.green,
  Prazo: TONE.red, Contrato: TONE.amber, Patrocínio: TONE.orange, Outdoor: TONE.teal, Rádio: TONE.yellow,
  "Produção de vídeo": TONE.fuchsia, Aprovação: TONE.lime,
  // categorias de conteúdo
  Legendas: TONE.blue, Matérias: TONE.indigo, Roteiros: TONE.fuchsia, "Spot Rádio": TONE.yellow, "E-mails": TONE.green,
  Comunicados: TONE.amber, Vídeos: TONE.pink, Stories: TONE.rose, Reels: TONE.violet, Campanhas: TONE.indigo,
  Templates: TONE.teal, "Arquivos Institucionais": TONE.lime,
};
export const toneOf = (value: string) => TONES[value] ?? TONE.gray;

/** Cor do ponto no calendário por categoria. */
export const DOT: Record<string, string> = {
  Campanha: "bg-indigo-500", Evento: "bg-pink-500", Publicação: "bg-sky-500", Reunião: "bg-violet-500",
  Entrega: "bg-emerald-500", Prazo: "bg-red-500", Contrato: "bg-amber-500", Patrocínio: "bg-orange-500",
  Outdoor: "bg-teal-500", Rádio: "bg-yellow-500", "Produção de vídeo": "bg-fuchsia-500", Aprovação: "bg-lime-500",
};

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "2026-11-07" → "07/11/2026" sem erro de fuso. */
export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const isOverdue = (due: string | null, done: boolean) => !!due && !done && due < todayISO();

// ----------------------------------------------------------------- Consultas

type Filter = { column: string; value: string | null };

function applyFilters<Q>(q: Q, filters: Filter[]): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r = q as any;
  for (const f of filters) r = f.value === null ? r.is(f.column, null) : r.eq(f.column, f.value);
  return r as Q;
}

export function useCampaigns() {
  useLiveTable("campaigns");
  return useQuery({
    queryKey: ["campaigns", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .is("deleted_at", null)
        .order("start_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });
}

export function useCampaign(id: string) {
  useLiveTable("campaigns");
  return useQuery({
    queryKey: ["campaigns", "one", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return (data as CampaignRow | null) ?? null;
    },
  });
}

export function useProjects(filters: Filter[] = []) {
  useLiveTable("projects");
  return useQuery({
    queryKey: ["projects", "list", filters],
    queryFn: async () => {
      const q = applyFilters(supabase.from("projects").select("*").is("deleted_at", null), filters);
      const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });
}

export function useProject(id: string) {
  useLiveTable("projects");
  return useQuery({
    queryKey: ["projects", "one", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return (data as ProjectRow | null) ?? null;
    },
  });
}

export function useTasks(filters: Filter[] = []) {
  useLiveTable("tasks");
  return useQuery({
    queryKey: ["tasks", "list", filters],
    queryFn: async () => {
      const q = applyFilters(supabase.from("tasks").select("*").is("deleted_at", null), filters);
      const { data, error } = await q.order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });
}

export function useEvents(opts: { from?: string; to?: string; filters?: Filter[] } = {}) {
  useLiveTable("calendar_events");
  const { from: start, to: end, filters = [] } = opts;
  return useQuery({
    queryKey: ["calendar_events", "list", start, end, filters],
    queryFn: async () => {
      let q = applyFilters(supabase.from("calendar_events").select("*").is("deleted_at", null), filters);
      if (start) q = q.gte("event_date", start);
      if (end) q = q.lte("event_date", end);
      const { data, error } = await q.order("event_date").order("start_time", { nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as CalendarEventRow[];
    },
  });
}

export function useContents(filters: Filter[] = []) {
  useLiveTable("content_items");
  return useQuery({
    queryKey: ["content_items", "list", filters],
    queryFn: async () => {
      const q = applyFilters(supabase.from("content_items").select("*").is("deleted_at", null), filters);
      const { data, error } = await q.order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentItemRow[];
    },
  });
}

export function useContentVersions(contentId: string | undefined) {
  useLiveTable("content_versions");
  return useQuery({
    queryKey: ["content_versions", contentId],
    enabled: !!contentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_versions")
        .select("*")
        .eq("content_id", contentId!)
        .order("version_no", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentVersionRow[];
    },
  });
}

export function useFavorites() {
  const { user } = useAuth();
  useLiveTable("content_favorites");
  return useQuery({
    queryKey: ["content_favorites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("content_favorites").select("content_id");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.content_id as string));
    },
  });
}

export function useChecklist(module: string, recordId: string) {
  useLiveTable("checklist_items");
  return useQuery({
    queryKey: ["checklist_items", module, recordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("module", module)
        .eq("record_id", recordId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as ChecklistItemRow[];
    },
  });
}

export function useRecordHistory(table: string, id: string) {
  return useQuery({
    queryKey: ["history", table, id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("record_history", { _table: table, _id: id });
      if (error) throw error;
      return (data ?? []) as RecordHistoryRow[];
    },
  });
}

// ----------------------------------------------------------------- Situação da campanha pelas datas

export type CampaignPhaseKey = "no_ar" | "programada" | "concluida" | "parada" | "sem_datas";
export type CampaignPhase = {
  key: CampaignPhaseKey;
  /** Nome curto da situação ("No ar", "Programada", "Concluída" ou o status manual). */
  label: string;
  /** Detalhe de tempo ("termina em 5 dias", "começa em 13 dias", "encerrada há 2 dias"). */
  detail: string;
  /** 0–100: quanto do período já passou. */
  progress: number;
  day: number;
  totalDays: number;
};

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/**
 * Situação que a equipe enxerga: calculada pelas datas, sem depender de alguém mudar o status à mão.
 * Pausada, Cancelada e Rascunho continuam valendo como foram marcadas.
 */
export function campaignPhase(c: { status: string; start_date: string | null; end_date: string | null }, today = todayISO()): CampaignPhase {
  const base = { progress: 0, day: 0, totalDays: 0 };
  if (["Cancelada", "Pausada", "Rascunho"].includes(c.status)) return { ...base, key: "parada", label: c.status, detail: "" };
  const start = c.start_date;
  const end = c.end_date ?? c.start_date;
  if (!start || !end) {
    return c.status === "Concluída"
      ? { ...base, key: "concluida", label: "Concluída", detail: "" }
      : { ...base, key: "sem_datas", label: c.status, detail: "sem período definido" };
  }
  const totalDays = dayDiff(start, end) + 1;
  if (c.status === "Concluída" || today > end) {
    const ago = dayDiff(end, today);
    return { key: "concluida", label: "Concluída", detail: ago > 0 ? `encerrada há ${plural(ago, "dia", "dias")}` : "encerrada", progress: 100, day: totalDays, totalDays };
  }
  if (today < start) {
    const n = dayDiff(today, start);
    return { key: "programada", label: "Programada", detail: n === 1 ? "começa amanhã" : `começa em ${n} dias`, progress: 0, day: 0, totalDays };
  }
  const day = dayDiff(start, today) + 1;
  const left = dayDiff(today, end);
  return {
    key: "no_ar",
    label: "No ar",
    detail: left === 0 ? "termina hoje" : left === 1 ? "termina amanhã" : `termina em ${left} dias`,
    progress: Math.min(100, Math.round((day / totalDays) * 100)),
    day,
    totalDays,
  };
}

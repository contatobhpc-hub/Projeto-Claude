// Fase 5 — Inteligência: notificações, planejamento, indicadores, workflows e IA.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  AiConversationRow,
  AiMessageRow,
  AiPromptRow,
  IndicatorRow,
  IndicatorValueRow,
  KeyResultRow,
  NotificationRow,
  ObjectiveRow,
  WorkflowRuleRow,
  WorkflowRunRow,
} from "@/integrations/supabase/types";
import { useLiveTable, useRows } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/lib/permissions";

// ----------------------------------------------------------------- Notificações

export function useNotifications(limit = 100) {
  const { user } = useAuth();
  useLiveTable("notifications");
  return useQuery({
    queryKey: ["notifications", user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

/** Roda a varredura de prazos uma vez por dia por navegador (o servidor evita duplicatas). */
export function useDailyAlerts() {
  const { profile } = usePermissions();
  useEffect(() => {
    if (!profile?.active) return;
    const key = `mhub.alerts.${profile.id}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch {
      /* sem armazenamento: roda mesmo assim */
    }
    void supabase.rpc("generate_due_notifications");
  }, [profile?.id, profile?.active]);
}

export async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
}

export const NOTIFICATION_KIND: Record<string, string> = {
  approval: "Aprovação",
  deadline: "Prazo",
  assignment: "Atribuição",
  alert: "Alerta",
  info: "Aviso",
};

// ----------------------------------------------------------------- Planejamento e indicadores

export const PERSPECTIVES = ["Negócios", "Marca", "Relacionamento", "Pessoas e processos"] as const;
export const OBJECTIVE_STATUSES = ["Planejado", "Em andamento", "Concluído", "Cancelado"] as const;
export const OBJECTIVE_PRESETS = [
  "Aumentar base de cooperados", "Fortalecer a marca", "Aumentar carteira de seguros", "Impulsionar consórcios",
  "Fortalecer crédito rural", "Aumentar capital social", "Melhorar comunicação interna", "Aumentar engajamento digital",
];

/** Calendário comercial de referência (temas por mês). */
export const COMMERCIAL_CALENDAR = [
  "Planejamento", "Volta às aulas", "Dia da Mulher", "Assembleias", "Dia das Mães", "Plano Safra",
  "Capital Premiado", "Dia dos Pais", "Cooperativismo", "Dia das Crianças", "Black Friday", "Natal",
];

export const useObjectives = (year: number) =>
  useRows<ObjectiveRow>("strategic_objectives", { filters: [{ column: "year", value: String(year) }], order: "created_at", ascending: true });
export const useKeyResults = () => useRows<KeyResultRow>("key_results", { order: "created_at", ascending: true, softDeleted: false });
export const useIndicators = () => useRows<IndicatorRow>("indicators", { order: "name", ascending: true });
export const useIndicatorValues = () => useRows<IndicatorValueRow>("indicator_values", { order: "period", ascending: true, softDeleted: false });

/** Valor atual do resultado-chave: o último valor do indicador ligado, ou o informado. */
export function krCurrent(kr: KeyResultRow, values: IndicatorValueRow[], indicators: IndicatorRow[], year?: number) {
  if (!kr.indicator_id) return Number(kr.current);
  const ind = indicators.find((i) => i.id === kr.indicator_id);
  const vals = values.filter((v) => v.indicator_id === kr.indicator_id && (!year || v.period.startsWith(String(year))));
  if (vals.length === 0) return Number(kr.current);
  // Mensal soma no ano; trimestral/anual usa o último
  if (ind?.frequency === "Mensal") return vals.reduce((s, v) => s + Number(v.value), 0);
  return Number(vals[vals.length - 1].value);
}

export function krProgress(kr: KeyResultRow, current: number) {
  const span = Number(kr.target) - Number(kr.baseline);
  if (span === 0) return current >= Number(kr.target) ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((current - Number(kr.baseline)) / span) * 100)));
}

// ----------------------------------------------------------------- Workflows

export const WORKFLOW_TRIGGERS: { id: string; label: string; module: string; fields: { field: string; label: string }[] }[] = [
  { id: "campaign_created", label: "Campanha criada", module: "Campanhas", fields: [{ field: "type", label: "Tipo" }, { field: "priority", label: "Prioridade" }] },
  { id: "campaign_status", label: "Status da campanha mudou", module: "Campanhas", fields: [{ field: "status", label: "Novo status" }] },
  { id: "project_created", label: "Projeto criado", module: "Projetos", fields: [{ field: "priority", label: "Prioridade" }] },
  { id: "event_created", label: "Evento criado", module: "Eventos", fields: [{ field: "type", label: "Tipo" }] },
  { id: "task_done", label: "Tarefa concluída", module: "Kanban", fields: [{ field: "priority", label: "Prioridade" }] },
  { id: "content_approved", label: "Conteúdo aprovado", module: "Conteúdos", fields: [{ field: "category", label: "Categoria" }] },
  { id: "purchase_approved", label: "Compra aprovada", module: "Compras", fields: [{ field: "urgency", label: "Urgência" }] },
  { id: "partner_created", label: "Parceiro cadastrado", module: "Parceiros", fields: [{ field: "category", label: "Categoria" }] },
  { id: "sponsorship_created", label: "Patrocínio cadastrado", module: "Patrocínios", fields: [{ field: "category", label: "Categoria" }] },
  { id: "contract_created", label: "Contrato cadastrado", module: "Contratos", fields: [{ field: "category", label: "Categoria" }] },
];

export const useWorkflowRules = () => useRows<WorkflowRuleRow>("workflow_rules", { order: "created_at", ascending: true });

export function useWorkflowRuns() {
  useLiveTable("workflow_runs");
  return useQuery({
    queryKey: ["workflow_runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_runs").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as WorkflowRunRow[];
    },
  });
}

// ----------------------------------------------------------------- Central IA

export const AI_TEMPLATES: { id: string; label: string; category: string; prompt: string }[] = [
  { id: "legenda", label: "Legenda", category: "Conteúdo", prompt: "Crie uma legenda envolvente para Instagram sobre [tema], com tom cooperativista, até 4 linhas e 3 hashtags relevantes." },
  { id: "roteiro", label: "Roteiro de vídeo", category: "Conteúdo", prompt: "Crie um roteiro de vídeo de 60 segundos sobre [tema], formato Reels, linguagem próxima e cooperativista." },
  { id: "spot", label: "Spot de rádio", category: "Conteúdo", prompt: "Crie um spot de rádio de 30 segundos sobre [tema], com locução clara e assinatura final do Sicoob Credibelo." },
  { id: "email", label: "E-mail marketing", category: "Conteúdo", prompt: "Escreva um e-mail marketing sobre [tema] para cooperados, com assunto, pré-header, corpo e chamada para ação." },
  { id: "release", label: "Release", category: "Imprensa", prompt: "Escreva um release de imprensa sobre [tema], com lead, corpo, espaço para citação do presidente e dados institucionais." },
  { id: "comunicado", label: "Comunicado interno", category: "Interno", prompt: "Redija um comunicado interno sobre [tema] para os colaboradores, tom institucional e claro." },
  { id: "campanha", label: "Estrutura de campanha", category: "Estratégia", prompt: "Estruture uma campanha sobre [tema]: objetivo, público, mensagem-chave, canais, peças, indicadores e cronograma." },
  { id: "briefing", label: "Briefing criativo", category: "Planejamento", prompt: "Monte um briefing criativo para [demanda]: contexto, objetivo, público, mensagem, tom, entregáveis e prazos." },
  { id: "checklist", label: "Checklist", category: "Planejamento", prompt: "Crie um checklist completo para [tipo de entrega], cobrindo pré-produção, execução e pós." },
  { id: "evento", label: "Plano de evento", category: "Eventos", prompt: "Estruture um evento sobre [tema]: objetivo, formato, público, programação, fornecedores, brindes e divulgação." },
  { id: "calendario", label: "Calendário editorial", category: "Planejamento", prompt: "Monte um calendário editorial mensal sobre [tema], com datas, formatos, canais e responsáveis." },
  { id: "relatorio", label: "Relatório de resultados", category: "Análise", prompt: "Gere a estrutura de um relatório de resultados de [campanha], com indicadores, gráficos sugeridos, aprendizados e recomendações." },
];

export const useAiConversations = () => useRows<AiConversationRow>("ai_conversations", { order: "updated_at", softDeleted: false });
export const useAiPrompts = () => useRows<AiPromptRow>("ai_prompts", { order: "title", ascending: true, softDeleted: false });

export function useAiMessages(conversationId: string | null) {
  useLiveTable("ai_messages");
  return useQuery({
    queryKey: ["ai_messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_messages").select("*").eq("conversation_id", conversationId!).order("created_at");
      if (error) throw error;
      return (data ?? []) as AiMessageRow[];
    },
  });
}

export async function askAi(input: { conversation_id: string | null; message: string; campaign_id: string | null; project_id: string | null }) {
  const { data, error } = await supabase.functions.invoke("ai-chat", { body: input });
  if (error) {
    // A função devolve { error: "mensagem" } com o código HTTP; tenta ler a mensagem
    let msg = "A Central IA não respondeu.";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      }
    } catch {
      /* mantém a mensagem padrão */
    }
    throw new Error(msg);
  }
  return data as { conversation_id: string; message: AiMessageRow };
}

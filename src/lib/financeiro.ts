// Fase 4 — Financeiro: valores, consultas e regras de apresentação.

import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  BudgetLineRow,
  BudgetOverviewRow,
  CostCenterRow,
  ExpenseRow,
  InvoiceRow,
  PaymentRow,
  PurchaseApprovalRow,
  PurchaseRequestRow,
} from "@/integrations/supabase/types";
import { useLiveTable, useRows, type RowFilter } from "@/lib/data";
import { todayISO } from "@/lib/operacao";
import { useAppSettings } from "@/lib/relacionamento";

export const PAYMENT_METHODS = ["Boleto", "PIX", "Cartão Corporativo", "Transferência", "Dinheiro"] as const;
export const URGENCIES = ["Baixa", "Média", "Alta", "Urgente"] as const;
export const PURCHASE_STATUSES = ["Rascunho", "Solicitado", "Em aprovação", "Aprovado", "Comprado", "Recebido", "Concluído", "Recusado", "Cancelado"] as const;
export const INVOICE_STATUSES = ["Pendente", "Aprovada", "Paga", "Cancelada"] as const;

export type FinanceSettings = { purchase_approval_limit: number; budget_categories: string[]; expense_categories: string[] };

const DEFAULTS: FinanceSettings = {
  purchase_approval_limit: 5000,
  budget_categories: [
    "Campanhas Comerciais", "Campanhas Institucionais", "Eventos", "Patrocínios", "Brindes", "Mídia Offline", "Tráfego Pago",
    "Endomarketing", "Treinamentos", "Comunicação Institucional",
  ],
  expense_categories: ["Outdoor", "Rádio", "Vídeo", "Fotografia", "Brindes", "Coffee Break", "Locação", "Impresso", "Facebook Ads", "Google Ads", "Produção", "Eventos", "Outros"],
};

export function useFinanceSettings(): FinanceSettings {
  const { data } = useAppSettings();
  const f = (data?.finance ?? {}) as Partial<FinanceSettings>;
  return {
    purchase_approval_limit: Number(f.purchase_approval_limit ?? DEFAULTS.purchase_approval_limit),
    budget_categories: f.budget_categories?.length ? f.budget_categories : DEFAULTS.budget_categories,
    expense_categories: f.expense_categories?.length ? f.expense_categories : DEFAULTS.expense_categories,
  };
}

/** Sugestão de categoria do orçamento a partir da categoria da despesa. */
export const BUDGET_FOR_EXPENSE: Record<string, string> = {
  Outdoor: "Mídia Offline", Rádio: "Mídia Offline", Vídeo: "Comunicação Institucional", Fotografia: "Comunicação Institucional",
  Brindes: "Brindes", "Coffee Break": "Eventos", Locação: "Eventos", Impresso: "Comunicação Institucional",
  "Facebook Ads": "Tráfego Pago", "Google Ads": "Tráfego Pago", Produção: "Campanhas Comerciais", Eventos: "Eventos",
};

/** Pagamento agendado com vencimento passado é exibido como atrasado. */
export const paymentState = (p: Pick<PaymentRow, "status" | "due_date">): "Agendado" | "Pago" | "Cancelado" | "Atrasado" =>
  p.status === "Agendado" && p.due_date < todayISO() ? "Atrasado" : p.status;

/** Quem precisa decidir a seguir, em texto. */
export function nextStep(pr: Pick<PurchaseRequestRow, "status" | "estimated_value">, limit: number): string {
  switch (pr.status) {
    case "Rascunho":
      return "Enviar para aprovação";
    case "Solicitado":
      return pr.estimated_value > limit ? "Aguardando Gestor (depois Diretoria)" : "Aguardando aprovação";
    case "Em aprovação":
      return "Aguardando Diretoria";
    case "Aprovado":
      return "Registrar compra";
    case "Comprado":
      return "Registrar recebimento";
    case "Recebido":
      return "Lançar nota e concluir";
    default:
      return "";
  }
}

// ----------------------------------------------------------------- Consultas

export const useCostCenters = () => useRows<CostCenterRow>("cost_centers", { order: "code", ascending: true });
export const useBudgetLines = (year: number) =>
  useRows<BudgetLineRow>("budget_lines", { filters: [{ column: "year", value: String(year) }], order: "category", ascending: true });
export const usePurchaseRequests = (filters: RowFilter[] = []) => useRows<PurchaseRequestRow>("purchase_requests", { filters, order: "created_at" });
export const useInvoices = (filters: RowFilter[] = []) => useRows<InvoiceRow>("invoices", { filters, order: "issue_date" });
export const usePayments = (filters: RowFilter[] = []) => useRows<PaymentRow>("payments", { filters, order: "due_date", ascending: true });
export const useExpenses = (filters: RowFilter[] = []) => useRows<ExpenseRow>("expenses", { filters, order: "expense_date" });

export function usePurchaseApprovals(requestId: string | undefined) {
  useLiveTable("purchase_approvals");
  return useQuery({
    queryKey: ["purchase_approvals", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_approvals").select("*").eq("request_id", requestId!).order("decided_at");
      if (error) throw error;
      return (data ?? []) as PurchaseApprovalRow[];
    },
  });
}

export function useBudgetOverview(year: number, enabled = true) {
  // Depende de várias tabelas; atualiza quando qualquer uma delas muda
  const qc = useQueryClient();
  const uid = useId();
  useEffect(() => {
    let ch = supabase.channel(`budget-overview-${uid}`);
    for (const table of ["budget_lines", "expenses", "invoices", "purchase_requests", "payments"]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void qc.invalidateQueries({ queryKey: ["budget-overview"] });
      });
    }
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc, uid]);
  return useQuery({
    queryKey: ["budget-overview", year],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("budget_overview", { _year: year });
      if (error) throw error;
      return ((data ?? []) as BudgetOverviewRow[]).map((r) => ({
        ...r,
        planned: Number(r.planned), approved: Number(r.approved), committed: Number(r.committed), spent: Number(r.spent),
      }));
    },
  });
}

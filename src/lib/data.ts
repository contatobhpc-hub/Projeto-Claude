// Camada de dados compartilhada: leitura, gravação e tempo real direto no banco.
// Não existe cópia no navegador: o React Query só guarda o que veio do banco
// e é invalidado quando qualquer pessoa da equipe altera a tabela.

import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type LiveTable =
  | "campaigns"
  | "projects"
  | "tasks"
  | "calendar_events"
  | "content_items"
  | "content_versions"
  | "content_favorites"
  | "checklist_items"
  | "partners"
  | "contracts"
  | "events"
  | "event_schedule"
  | "event_attendees"
  | "event_suppliers"
  | "sponsorships"
  | "offline_media"
  | "inventory_items"
  | "inventory_movements";

/** Mantém as consultas de uma tabela atualizadas quando alguém da equipe altera algo. */
export function useLiveTable(table: LiveTable) {
  const qc = useQueryClient();
  const uid = useId();
  useEffect(() => {
    const ch = supabase
      .channel(`live-${table}-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void qc.invalidateQueries({ queryKey: [table] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [table, uid, qc]);
}

// O cliente tipado do Supabase não aceita nomes de tabela dinâmicos; centralizamos o cast aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: LiveTable) => supabase.from(table) as any;

export async function insertRow<T>(table: LiveTable, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await from(table).insert(values).select("*").single();
  if (error) throw error;
  return data as T;
}

/**
 * Atualiza um registro. Se o banco não devolver a linha, é porque as regras de
 * acesso bloquearam (o Supabase não acusa erro nesse caso): avisamos a pessoa.
 */
export async function updateRow<T>(table: LiveTable, id: string, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await from(table).update(values).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Seu cargo não tem permissão para alterar este registro."), { code: "42501" });
  return data as T;
}

/** Move para a lixeira (fica 30 dias e pode ser restaurado pelo Administrador). */
export async function softDelete(table: LiveTable, id: string) {
  await updateRow(table, id, { deleted_at: new Date().toISOString() });
}

/** Converte "" em null para campos opcionais (datas, vínculos). */
export const orNull = (v: string | null | undefined) => (v && v.trim() ? v : null);

export type RowFilter = { column: string; value: string | null };

/**
 * Lista genérica de uma tabela, atualizada em tempo real.
 * `softDeleted` = a tabela tem lixeira (deleted_at); itens excluídos ficam de fora.
 */
export function useRows<T>(
  table: LiveTable,
  opts: { filters?: RowFilter[]; order?: string; ascending?: boolean; softDeleted?: boolean; enabled?: boolean } = {},
) {
  const { filters = [], order = "created_at", ascending = false, softDeleted = true, enabled = true } = opts;
  useLiveTable(table);
  return useQuery({
    queryKey: [table, "rows", filters, order, ascending],
    enabled,
    queryFn: async () => {
      let q = from(table).select("*");
      if (softDeleted) q = q.is("deleted_at", null);
      for (const f of filters) q = f.value === null ? q.is(f.column, null) : q.eq(f.column, f.value);
      const { data, error } = await q.order(order, { ascending, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

/** Um registro pelo id (null se não existe ou foi para a lixeira). */
export function useRow<T>(table: LiveTable, id: string | undefined) {
  useLiveTable(table);
  return useQuery({
    queryKey: [table, "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await from(table).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return (data as T | null) ?? null;
    },
  });
}

/** Insere/atualiza/apaga linhas de sub-tabelas sem lixeira (cronograma, convidados…). */
export async function deleteRow(table: LiveTable, id: string) {
  const { error, count } = await from(table).delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  if (count === 0) throw Object.assign(new Error("Seu cargo não tem permissão para remover este item."), { code: "42501" });
}

/** Lê um número digitado no formato brasileiro ("1.500,50") ou com ponto ("1500.50"). */
export function parseMoney(s: string): number {
  const t = s.trim().replace(/[R$\s]/g, "");
  if (!t) return 0;
  // "1.500" (milhar com ponto, sem vírgula) também é lido como 1500
  const normalized = t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** Valor numérico em texto no formato brasileiro, para preencher campos de edição. */
export const moneyInput = (n: number | null | undefined) => (n ? String(n).replace(".", ",") : "");

// Camada de dados compartilhada: leitura, gravação e tempo real direto no banco.
// Não existe cópia no navegador: o React Query só guarda o que veio do banco
// e é invalidado quando qualquer pessoa da equipe altera a tabela.

import { useEffect, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type LiveTable =
  | "campaigns"
  | "projects"
  | "tasks"
  | "calendar_events"
  | "content_items"
  | "content_versions"
  | "content_favorites"
  | "checklist_items";

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

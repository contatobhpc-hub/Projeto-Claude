import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { AuditLogRow, Json } from "@/integrations/supabase/types";
import { profileName, useProfiles } from "@/lib/team";

export const Route = createFileRoute("/admin/historico")({
  head: () => ({ meta: [{ title: "Histórico de alterações — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <AuditPage />
    </ModuleGuard>
  ),
});

const PAGE = 50;

/** Nomes amigáveis das tabelas. As fases seguintes acrescentam as suas aqui. */
const TABLE_LABELS: Record<string, string> = {
  profiles: "Usuários",
  roles: "Cargos",
  role_permissions: "Permissões",
  attachments: "Anexos",
  app_settings: "Configurações",
  campaigns: "Campanhas",
  projects: "Projetos",
  tasks: "Tarefas",
  calendar_events: "Calendário",
  content_items: "Conteúdos",
  partners: "Parceiros",
  contracts: "Contratos",
  events: "Eventos",
  event_schedule: "Cronograma de eventos",
  event_attendees: "Convidados",
  event_suppliers: "Fornecedores de eventos",
  sponsorships: "Patrocínios",
  offline_media: "Mídia offline",
  inventory_items: "Brindes",
  inventory_movements: "Movimentações de estoque",
  checklist_items: "Checklists",
  comments: "Comentários",
};

const ACTION_LABELS: Record<AuditLogRow["action"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  insert: { label: "Criou", variant: "secondary" },
  update: { label: "Alterou", variant: "outline" },
  delete: { label: "Apagou de vez", variant: "destructive" },
  soft_delete: { label: "Moveu p/ lixeira", variant: "destructive" },
  restore: { label: "Restaurou", variant: "default" },
};

const IGNORED = new Set(["updated_at", "updated_by", "created_at", "created_by"]);

function changedFields(oldD: Json | null, newD: Json | null): string[] {
  const o = (oldD ?? {}) as Record<string, unknown>;
  const n = (newD ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  return [...keys].filter((k) => !IGNORED.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
}

function recordLabel(row: AuditLogRow): string {
  const d = ((row.new_data ?? row.old_data) ?? {}) as Record<string, unknown>;
  const v = d.title ?? d.name ?? d.full_name ?? d.file_name ?? d.email ?? d.key ?? d.module;
  return typeof v === "string" ? v : (row.record_id ?? "—");
}

function AuditPage() {
  const { data: profiles } = useProfiles();
  const [table, setTable] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { data, isFetching } = useQuery({
    queryKey: ["audit", table, userId, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("changed_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (table !== "all") q = q.eq("table_name", table);
      if (userId !== "all") q = q.eq("changed_by", userId);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as AuditLogRow[], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <PageHeader title="Histórico de alterações" description="Quem criou, alterou, excluiu ou restaurou cada registro, e quando. Só Administradores veem esta tela." />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={table} onValueChange={(v) => { setTable(v); setPage(0); }}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(0); }}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as pessoas</SelectItem>
            {(profiles ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Quando</TableHead>
              <TableHead className="w-[180px]">Quem</TableHead>
              <TableHead className="w-[150px]">Ação</TableHead>
              <TableHead className="w-[140px]">Área</TableHead>
              <TableHead>Registro e campos alterados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {isFetching ? "Carregando…" : "Nenhuma alteração encontrada."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const a = ACTION_LABELS[r.action];
              const fields = r.action === "update" ? changedFields(r.old_data, r.new_data) : [];
              return (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(r.changed_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">{profileName(profiles, r.changed_by)}</TableCell>
                  <TableCell><Badge variant={a.variant}>{a.label}</Badge></TableCell>
                  <TableCell className="text-sm">{TABLE_LABELS[r.table_name] ?? r.table_name}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{recordLabel(r)}</div>
                    {fields.length > 0 && <div className="text-xs text-muted-foreground">Campos: {fields.join(", ")}</div>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} registros</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <span>Página {page + 1} de {pages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RotateCcw, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { TrashRow } from "@/integrations/supabase/types";
import { profileName, useModules, useProfiles } from "@/lib/team";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/admin/lixeira")({
  head: () => ({ meta: [{ title: "Lixeira — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="admin">
      <TrashPage />
    </ModuleGuard>
  ),
});

type Confirm = { kind: "one"; row: TrashRow } | { kind: "expired" } | null;

function TrashPage() {
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const { data: modules } = useModules();
  const [confirm, setConfirm] = useState<Confirm>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_trash");
      if (error) throw error;
      return ((data ?? []) as TrashRow[]).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    },
  });

  const moduleLabel = (key: string) => modules?.find((m) => m.key === key)?.label ?? key;
  const refresh = () => qc.invalidateQueries({ queryKey: ["trash"] });

  async function restore(r: TrashRow) {
    const { error } = await supabase.rpc("restore_item", { _table: r.table_name, _id: r.record_id });
    if (error) return toast.error(errorMessage(error));
    toast.success(`"${r.title ?? "Item"}" restaurado.`);
    void refresh();
    void qc.invalidateQueries({ queryKey: [r.table_name] });
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "one") {
      const { error } = await supabase.rpc("purge_item", { _table: confirm.row.table_name, _id: confirm.row.record_id });
      if (error) toast.error(errorMessage(error));
      else toast.success("Apagado definitivamente.");
    } else {
      const { data, error } = await supabase.rpc("purge_expired_trash");
      if (error) toast.error(errorMessage(error));
      else toast.success(data ? `${data} itens antigos apagados.` : "Nenhum item com mais de 30 dias.");
    }
    setConfirm(null);
    void refresh();
  }

  return (
    <>
      <PageHeader
        title="Lixeira"
        description="Itens excluídos em qualquer módulo ficam aqui por 30 dias e podem ser restaurados. Só Administradores apagam de vez."
        actions={
          <Button variant="outline" onClick={() => setConfirm({ kind: "expired" })}>
            <Trash2 className="h-4 w-4" /> Esvaziar itens com +30 dias
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-border bg-card max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent">
        <Table className="table-cards">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="w-[170px]">Módulo</TableHead>
              <TableHead className="w-[180px]">Excluído por</TableHead>
              <TableHead className="w-[150px]">Em</TableHead>
              <TableHead className="w-[140px]">Apaga em</TableHead>
              <TableHead className="w-[210px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  {isLoading ? "Carregando…" : "A lixeira está vazia. Os módulos das próximas fases enviam para cá o que for excluído."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={`${r.table_name}:${r.record_id}`}>
                <TableCell className="font-medium">{r.title ?? "Sem título"}</TableCell>
                <TableCell className="text-sm">{moduleLabel(r.module)}</TableCell>
                <TableCell className="text-sm">{profileName(profiles, r.deleted_by)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(r.deleted_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(r.purge_at) < new Date() ? "vencido" : formatDistanceToNowStrict(new Date(r.purge_at), { locale: ptBR })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => void restore(r)}>
                      <RotateCcw className="h-4 w-4" /> Restaurar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ kind: "one", row: r })}>
                      Apagar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "one" ? `Apagar "${confirm.row.title ?? "item"}" para sempre?` : "Apagar itens com mais de 30 dias?"}
            </AlertDialogTitle>
            <AlertDialogDescription>Não dá para desfazer. O registro some do sistema; o histórico guarda quem apagou.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runConfirm()}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

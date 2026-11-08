import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ops/record-panels";
import { supabase } from "@/integrations/supabase/client";
import type { NotificationRow } from "@/integrations/supabase/types";
import { markRead, NOTIFICATION_KIND, useNotifications } from "@/lib/inteligencia";

export const Route = createFileRoute("/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="notificacoes">
      <NotificationsPage />
    </ModuleGuard>
  ),
});

type Filter = "nao-lidas" | "todas" | "approval" | "deadline" | "assignment";

function NotificationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: list = [], isLoading } = useNotifications(500);
  const [filter, setFilter] = useState<Filter>("nao-lidas");

  const rows = useMemo(
    () => list.filter((n) => (filter === "todas" ? true : filter === "nao-lidas" ? !n.read_at : n.kind === filter)),
    [list, filter],
  );
  const unread = list.filter((n) => !n.read_at);
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  async function open(n: NotificationRow) {
    if (!n.read_at) await markRead([n.id]);
    void refresh();
    if (n.link) router.history.push(n.link);
  }

  // Agrupa por dia
  const groups = new Map<string, NotificationRow[]>();
  for (const n of rows) {
    const k = n.created_at.slice(0, 10);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }

  return (
    <>
      <PageHeader
        title="Notificações"
        description="Aprovações pedidas a você, tarefas atribuídas, prazos chegando e alertas do sistema. Os prazos são verificados todo dia."
        actions={
          <div className="flex gap-2">
            {unread.length > 0 && (
              <Button variant="outline" onClick={async () => { await markRead(unread.map((n) => n.id)); void refresh(); }}>
                <CheckCheck className="h-4 w-4" /> Marcar todas como lidas
              </Button>
            )}
            {list.some((n) => n.read_at) && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await supabase.from("notifications").delete().not("read_at", "is", null);
                  void refresh();
                }}
              >
                <Trash2 className="h-4 w-4" /> Limpar lidas
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="nao-lidas">Não lidas ({unread.length})</TabsTrigger>
          <TabsTrigger value="approval">Aprovações</TabsTrigger>
          <TabsTrigger value="deadline">Prazos</TabsTrigger>
          <TabsTrigger value="assignment">Atribuições</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Bell} title={filter === "nao-lidas" ? "Tudo em dia" : "Nada aqui"} desc="Quando algo precisar de você, aparece nesta página e no sino do topo." />
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day} className="rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2 text-sm font-semibold capitalize">
                {format(new Date(`${day}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h2>
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => void open(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 ${n.read_at ? "" : "bg-primary/5"}`}>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-primary"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                        {NOTIFICATION_KIND[n.kind] ?? "Aviso"}
                        <br />
                        {format(new Date(n.created_at), "HH:mm")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

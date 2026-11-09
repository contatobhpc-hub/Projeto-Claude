import { useNavigate, useRouter } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markRead, NOTIFICATION_KIND, useDailyAlerts, useNotifications } from "@/lib/inteligencia";
import type { NotificationRow } from "@/integrations/supabase/types";

/** Sino do cabeçalho: contador de não lidas e as 8 mais recentes. */
export function NotificationsBell() {
  useDailyAlerts();
  const nav = useNavigate();
  const router = useRouter();
  const { data: list = [], refetch } = useNotifications(50);
  const unread = list.filter((n) => !n.read_at);

  async function open(n: NotificationRow) {
    if (!n.read_at) await markRead([n.id]);
    void refetch();
    // O link pode trazer parâmetros (ex.: /compras?id=…), por isso vai direto para o histórico
    if (n.link) router.history.push(n.link);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notificações (${unread.length} não lidas)`} className="press relative h-10 w-10 rounded-full">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">Notificações</span>
          {unread.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await markRead(unread.map((n) => n.id));
                void refetch();
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nada por aqui.</li>}
          {list.slice(0, 8).map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => void open(n)} className={`w-full px-4 py-3 text-left hover:bg-muted/50 ${n.read_at ? "" : "bg-primary/5"}`}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug">{n.title}</div>
                    {n.body && <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</div>}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {NOTIFICATION_KIND[n.kind] ?? "Aviso"} · {formatDistanceToNowStrict(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2">
          <button type="button" className="text-xs font-medium text-primary-ink hover:underline" onClick={() => void nav({ to: "/notificacoes" })}>
            Ver todas
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { channelName } from "@/lib/data";
import type { CommentRow } from "@/integrations/supabase/types";
import { usePermissions, type ModuleKey } from "@/lib/permissions";
import { profileName, useProfiles } from "@/lib/team";
import { errorMessage } from "@/lib/errors";

/**
 * Comentários da equipe em um registro, atualizados em tempo real.
 * Uso: <RecordComments module="contratos" recordId={contract.id} />
 */
export function RecordComments({ module, recordId }: { module: ModuleKey; recordId: string }) {
  const qc = useQueryClient();
  const { profile, isAdmin } = usePermissions();
  const { data: profiles } = useProfiles();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const qKey = ["comments", module, recordId] as const;

  const { data: comments = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("module", module)
        .eq("record_id", recordId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(channelName(`comments-${module}-${recordId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `record_id=eq.${recordId}` },
        () => void qc.invalidateQueries({ queryKey: ["comments", module, recordId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [module, recordId, qc]);

  async function submit(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !profile) return;
    setBusy(true);
    const { error } = await supabase.from("comments").insert({ module, record_id: recordId, body, created_by: profile.id });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    setText("");
    void qc.invalidateQueries({ queryKey: qKey });
  }

  async function remove(c: CommentRow) {
    if (!window.confirm("Apagar este comentário?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", c.id);
    if (error) return toast.error(errorMessage(error));
    void qc.invalidateQueries({ queryKey: qKey });
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Comentários</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="group rounded-xl border border-border bg-surface/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <strong className="font-medium text-foreground">{profileName(profiles, c.created_by)}</strong> ·{" "}
                  {formatDistanceToNowStrict(new Date(c.created_at), { locale: ptBR, addSuffix: true })}
                </span>
                {(c.created_by === profile?.id || isAdmin) && (
                  <button
                    type="button"
                    aria-label="Apagar comentário"
                    className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => void remove(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva um comentário"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(e);
          }}
        />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Enviar comentário">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

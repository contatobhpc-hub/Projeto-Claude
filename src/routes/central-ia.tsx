import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, Copy, FilePlus2, Loader2, MessageSquarePlus, Save, Send, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/components/permission-gate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignSelect, Field, ProjectSelect } from "@/components/ops/fields";
import { supabase } from "@/integrations/supabase/client";
import type { AiMessageRow } from "@/integrations/supabase/types";
import { deleteRow, insertRow } from "@/lib/data";
import { errorMessage } from "@/lib/errors";
import { usePermissions } from "@/lib/permissions";
import { AI_TEMPLATES, askAi, useAiConversations, useAiMessages, useAiPrompts } from "@/lib/inteligencia";
import { useAppSettings } from "@/lib/relacionamento";

export const Route = createFileRoute("/central-ia")({
  head: () => ({ meta: [{ title: "Central IA — Marketing Hub" }] }),
  component: () => (
    <ModuleGuard module="ia">
      <AiPage />
    </ModuleGuard>
  ),
});

function AiPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const { data: settings } = useAppSettings();
  const limit = Number((settings?.ai as { monthly_message_limit?: number } | undefined)?.monthly_message_limit ?? 300);
  const { data: conversations = [] } = useAiConversations();
  const { data: prompts = [] } = useAiPrompts();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: messages = [] } = useAiMessages(activeId);
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const [text, setText] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCampaignId(active?.campaign_id ?? null);
    setProjectId(active?.project_id ?? null);
  }, [active?.id, active?.campaign_id, active?.project_id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  useEffect(() => {
    void supabase.rpc("ai_usage_this_month").then(({ data }) => setUsed(Number(data ?? 0)));
  }, [messages.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || pending) return;
    setPending(msg);
    setText("");
    try {
      const res = await askAi({ conversation_id: activeId, message: msg, campaign_id: campaignId, project_id: projectId });
      setActiveId(res.conversation_id);
      void qc.invalidateQueries({ queryKey: ["ai_messages"] });
      void qc.invalidateQueries({ queryKey: ["ai_conversations"] });
    } catch (err) {
      toast.error(errorMessage(err));
      setText(msg);
    } finally {
      setPending(null);
    }
  }

  async function removeConversation(id: string) {
    if (!window.confirm("Apagar esta conversa?")) return;
    try {
      await deleteRow("ai_conversations", id);
      if (activeId === id) setActiveId(null);
      void qc.invalidateQueries({ queryKey: ["ai_conversations"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function saveAsContent(m: AiMessageRow) {
    const title = window.prompt("Título do conteúdo:", active?.title ?? "Texto gerado pela IA");
    if (!title) return;
    try {
      await insertRow("content_items", { title, body: m.content, campaign_id: campaignId, project_id: projectId, description: "Rascunho gerado na Central IA", category: "Legendas" });
      toast.success("Salvo como rascunho em Conteúdos.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function savePrompt() {
    const p = text.trim();
    if (!p) return void toast.error("Escreva o pedido que quer guardar.");
    const title = window.prompt("Nome do modelo de pedido:");
    if (!title) return;
    try {
      await insertRow("ai_prompts", { title, prompt: p, category: "Da equipe" });
      void qc.invalidateQueries({ queryKey: ["ai_prompts"] });
      toast.success("Modelo guardado para a equipe.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const shown: Pick<AiMessageRow, "id" | "role" | "content" | "created_at">[] = [
    ...messages,
    ...(pending ? [{ id: "pending", role: "user" as const, content: pending, created_at: new Date().toISOString() }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Central IA"
        description="Assistente de redação e planejamento com o Claude. Escolha uma campanha ou projeto para a IA considerar os dados dele. As conversas são só suas."
        actions={used !== null && limit > 0 ? <span className="text-xs text-muted-foreground">{used} de {limit} perguntas neste mês</span> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_280px]">
        {/* Conversas */}
        <aside className="space-y-2">
          <Button className="w-full" variant="outline" onClick={() => { setActiveId(null); setText(""); }}>
            <MessageSquarePlus className="h-4 w-4" /> Nova conversa
          </Button>
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm ${c.id === activeId ? "bg-primary/12 font-medium" : "hover:bg-muted/50"}`}
                >
                  <span className="block truncate">{c.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{formatDistanceToNowStrict(new Date(c.updated_at), { locale: ptBR, addSuffix: true })}</span>
                </button>
                <button type="button" aria-label="Apagar conversa" className="p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" onClick={() => void removeConversation(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Chat */}
        <section className="flex min-h-[560px] flex-col rounded-2xl border border-border bg-card">
          <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-2">
            <Field label="Considerar a campanha"><CampaignSelect value={campaignId} onChange={setCampaignId} /></Field>
            <Field label="Considerar o projeto"><ProjectSelect value={projectId} onChange={setProjectId} campaignId={campaignId} /></Field>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {shown.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Bot className="mb-3 h-8 w-8" />
                <p className="text-sm">Escolha um modelo ao lado ou escreva o que precisa.</p>
              </div>
            )}
            {shown.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  {m.role === "assistant" && (
                    <div className="mt-2 flex gap-1 border-t border-border pt-2">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => void navigator.clipboard.writeText(m.content).then(() => toast.success("Copiado."))}>
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </Button>
                      {can("conteudos", "create") && (
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => void saveAsContent(m as AiMessageRow)}>
                          <FilePlus2 className="h-3.5 w-3.5" /> Salvar como conteúdo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Escrevendo…
              </div>
            )}
            <div ref={bottom} />
          </div>
          <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Ex.: Crie 3 opções de legenda para o Dia C, com chamada para o voluntariado."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={!can("ia", "create")}
            />
            <div className="flex flex-col gap-2">
              <Button type="submit" size="icon" disabled={!text.trim() || !!pending || !can("ia", "create")} aria-label="Enviar">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              {can("ia", "create") && (
                <Button type="button" size="icon" variant="outline" onClick={() => void savePrompt()} aria-label="Guardar como modelo da equipe" title="Guardar como modelo da equipe">
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </section>

        {/* Modelos */}
        <aside>
          <Tabs defaultValue="prontos">
            <TabsList className="w-full">
              <TabsTrigger value="prontos" className="flex-1">Modelos</TabsTrigger>
              <TabsTrigger value="equipe" className="flex-1">Da equipe ({prompts.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="prontos">
              <ul className="space-y-1">
                {AI_TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setText(t.prompt)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-muted/50">
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{t.category} · substitua o que está [entre colchetes]</span>
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="equipe">
              {prompts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Escreva um pedido e use o botão de salvar para guardar como modelo.</p>
              ) : (
                <ul className="space-y-1">
                  {prompts.map((p) => (
                    <li key={p.id} className="group flex items-start gap-1">
                      <button type="button" onClick={() => setText(p.prompt)} className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left hover:bg-muted/50">
                        <span className="block truncate text-sm font-medium">{p.title}</span>
                        <span className="line-clamp-2 block text-[11px] text-muted-foreground">{p.prompt}</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Remover modelo"
                        className="p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                        onClick={async () => {
                          try {
                            await deleteRow("ai_prompts", p.id);
                            void qc.invalidateQueries({ queryKey: ["ai_prompts"] });
                          } catch (err) {
                            toast.error(errorMessage(err));
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </>
  );
}

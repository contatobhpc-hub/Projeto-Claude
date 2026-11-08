// Central IA — Edge Function do Supabase.
//
// Recebe a pergunta de quem está logado, monta o contexto (organização + campanha
// ou projeto escolhido, lidos COM AS PERMISSÕES da própria pessoa) e chama o Claude.
// A chave da Anthropic fica só aqui, como segredo do Supabase:
//   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Publicar:  npx supabase functions deploy ai-chat
//
// Corpo: { conversation_id?: string, message: string, campaign_id?: string, project_id?: string }
// Resposta: { conversation_id, message: { id, role, content, created_at } }

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const HISTORY_LIMIT = 20;
const MAX_INPUT_CHARS = 8000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Faça login para usar a Central IA." });

  // Cliente com a identidade de quem chamou: tudo que ele lê respeita as permissões do cargo
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, service);

  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "Sessão expirada. Entre novamente." });
  const uid = userData.user.id;

  const { data: allowed } = await asUser.rpc("has_perm", { _module: "ia", _action: "create" });
  if (!allowed) return json(403, { error: "Seu cargo não tem acesso à Central IA." });

  if (!apiKey) {
    return json(503, { error: "A Central IA ainda não foi configurada. Um Administrador precisa cadastrar a chave da Anthropic no Supabase (ANTHROPIC_API_KEY)." });
  }

  let body: { conversation_id?: string; message?: string; campaign_id?: string | null; project_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Requisição inválida." });
  }
  const text = (body.message ?? "").trim();
  if (!text) return json(400, { error: "Escreva uma mensagem." });
  if (text.length > MAX_INPUT_CHARS) return json(400, { error: `Mensagem muito longa (máximo ${MAX_INPUT_CHARS} caracteres).` });

  // Configurações (modelo, limite mensal, contexto da organização)
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "ai").maybeSingle();
  const cfg = (setting?.value ?? {}) as { model?: string; monthly_message_limit?: number; org_context?: string };
  const model = cfg.model?.trim() || Deno.env.get("AI_MODEL") || "claude-sonnet-5-5";
  const limit = Number(cfg.monthly_message_limit ?? 300);

  const { data: used } = await admin.rpc("ai_usage_this_month", { _user: uid });
  if (limit > 0 && Number(used ?? 0) >= limit) {
    return json(429, { error: `Você atingiu o limite de ${limit} perguntas neste mês. Fale com um Administrador.` });
  }

  // Conversa: usa a existente (se for da pessoa) ou cria uma nova
  let conversationId = body.conversation_id ?? null;
  let campaignId = body.campaign_id ?? null;
  let projectId = body.project_id ?? null;
  if (conversationId) {
    const { data: conv } = await asUser.from("ai_conversations").select("id, campaign_id, project_id").eq("id", conversationId).maybeSingle();
    if (!conv) return json(404, { error: "Conversa não encontrada." });
    campaignId = campaignId ?? conv.campaign_id;
    projectId = projectId ?? conv.project_id;
    await asUser.from("ai_conversations").update({ campaign_id: campaignId, project_id: projectId, updated_at: new Date().toISOString() }).eq("id", conversationId);
  } else {
    const { data: conv, error } = await asUser
      .from("ai_conversations")
      .insert({ title: text.slice(0, 60), campaign_id: campaignId, project_id: projectId })
      .select("id")
      .single();
    if (error || !conv) return json(500, { error: "Não foi possível abrir a conversa." });
    conversationId = conv.id;
  }

  const { error: insErr } = await asUser.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: text });
  if (insErr) return json(500, { error: "Não foi possível registrar a pergunta." });

  // Histórico recente
  const { data: history } = await asUser
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const messages = (history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Contexto do registro escolhido (lido com as permissões da pessoa)
  const context: string[] = [];
  if (campaignId) {
    const { data: c } = await asUser
      .from("campaigns")
      .select("name, type, objective, status, start_date, end_date, budget, products, description, notes")
      .eq("id", campaignId)
      .maybeSingle();
    if (c) {
      context.push(
        `Campanha em foco: ${c.name} (${c.type}, objetivo ${c.objective}, status ${c.status}, ${c.start_date ?? "?"} a ${c.end_date ?? "?"}, ` +
          `orçamento R$ ${c.budget}). Produtos: ${(c.products ?? []).join(", ") || "—"}. Descrição: ${c.description || "—"}. Observações: ${c.notes || "—"}.`,
      );
      const { data: tasks } = await asUser.from("tasks").select("title, status, due_date").eq("campaign_id", campaignId).is("deleted_at", null).limit(30);
      if (tasks?.length) context.push(`Tarefas da campanha: ${tasks.map((t) => `${t.title} [${t.status}${t.due_date ? `, prazo ${t.due_date}` : ""}]`).join("; ")}.`);
    }
  }
  if (projectId) {
    const { data: p } = await asUser.from("projects").select("name, status, due_date, requester_area, description").eq("id", projectId).maybeSingle();
    if (p) context.push(`Projeto em foco: ${p.name} (status ${p.status}, prazo ${p.due_date ?? "?"}, área ${p.requester_area || "—"}). ${p.description || ""}`);
  }

  const system = [
    cfg.org_context?.trim() || "Você apoia a equipe de Marketing de uma cooperativa de crédito. Responda em português do Brasil.",
    "Entregue textos prontos para uso, bem estruturados. Quando faltar informação essencial, diga o que falta em uma linha e proponha uma versão com marcadores [entre colchetes].",
    "Não invente números, taxas, datas ou nomes de pessoas. Não inclua dados pessoais de cooperados.",
    ...context,
  ].join("\n\n");

  let reply = "";
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2048, system, messages }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Anthropic error", res.status, data);
      const msg = res.status === 401 ? "A chave da Anthropic é inválida." : res.status === 429 ? "Muitas solicitações à IA agora. Tente em instantes." : "A IA não respondeu. Tente novamente.";
      return json(502, { error: msg, conversation_id: conversationId });
    }
    reply = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
    tokensIn = data.usage?.input_tokens ?? null;
    tokensOut = data.usage?.output_tokens ?? null;
  } catch (err) {
    console.error(err);
    return json(502, { error: "Falha de conexão com a IA. Tente novamente.", conversation_id: conversationId });
  }
  if (!reply) reply = "(A IA não retornou texto.)";

  // A resposta é gravada com a chave de serviço (pessoas não podem forjar respostas)
  const { data: saved, error: saveErr } = await admin
    .from("ai_messages")
    .insert({ conversation_id: conversationId, role: "assistant", content: reply, tokens_in: tokensIn, tokens_out: tokensOut })
    .select("id, role, content, created_at")
    .single();
  if (saveErr) return json(500, { error: "Resposta gerada, mas não foi possível salvá-la.", conversation_id: conversationId });

  return json(200, { conversation_id: conversationId, message: saved });
});

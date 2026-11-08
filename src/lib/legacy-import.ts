// Importação do backup do app antigo (arquivo JSON gerado em Configurações → Backup).
// Converte cada módulo para as tabelas novas, preservando vínculos (campanha ↔ projeto ↔ tarefa…)
// e trocando nomes de pessoas pelos usuários cadastrados quando o nome bate.

import { supabase } from "@/integrations/supabase/client";
import type { Json, ProfileRow } from "@/integrations/supabase/types";

type Any = Record<string, unknown>;
type Row = Record<string, unknown>;

export type ImportPlan = {
  tables: { table: string; label: string; rows: Row[] }[];
  warnings: string[];
};

// ----------------------------------------------------------------- utilitários

const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Any[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const date = (v: unknown): string | null => {
  const s = str(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const time = (v: unknown): string | null => (/^\d{1,2}:\d{2}/.test(str(v)) ? str(v).slice(0, 5) : null);
const ts = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const s = str(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
};
const strings = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const uuid = () => crypto.randomUUID();
const orderedRange = (a: string | null, b: string | null): [string | null, string | null] => (a && b && b < a ? [a, null] : [a, b]);

const PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"] as const;

// ----------------------------------------------------------------- conversão

export function buildPlan(backup: unknown, profiles: ProfileRow[], existingCostCenters: { id: string; code: string }[]): ImportPlan {
  const root = (backup ?? {}) as Any;
  const data = ((root.data && typeof root.data === "object" ? root.data : root) ?? {}) as Any;
  const warnings: string[] = [];

  // Pessoas: nome ou e-mail → id do usuário
  const people = new Map<string, string>();
  for (const p of profiles) {
    if (p.full_name) people.set(norm(p.full_name), p.id);
    people.set(norm(p.email), p.id);
    people.set(norm(p.email.split("@")[0]), p.id);
  }
  const unmatched = new Set<string>();
  const person = (name: unknown): string | null => {
    const n = str(name);
    if (!n) return null;
    const id = people.get(norm(n)) ?? [...people.entries()].find(([k]) => k.split(" ")[0] === norm(n).split(" ")[0] && norm(n).split(" ").length === 1)?.[1];
    if (!id) unmatched.add(n);
    return id ?? null;
  };
  const personList = (names: unknown) => [...new Set(strings(names).map(person).filter((x): x is string => !!x))];

  // Mapas de id antigo → id novo (para manter os vínculos)
  const ids = { campaign: new Map<string, string>(), project: new Map<string, string>(), task: new Map<string, string>(), partner: new Map<string, string>(),
    contract: new Map<string, string>(), event: new Map<string, string>(), cc: new Map<string, string>(), invoice: new Map<string, string>() };
  const byName = { campaign: new Map<string, string>(), partner: new Map<string, string>(), event: new Map<string, string>() };
  const ref = (map: Map<string, string>, names: Map<string, string> | null, v: unknown) => {
    const s = str(v);
    if (!s) return null;
    return map.get(s) ?? names?.get(norm(s)) ?? null;
  };

  const out: Record<string, Row[]> = {};
  const push = (table: string, row: Row) => (out[table] ??= []).push(row);
  const checklist = (module: string, recordId: string, items: unknown, group = "") => {
    for (const it of arr(items)) {
      const text = str(it.text);
      if (text) push("checklist_items", { module, record_id: recordId, text, done: !!(it.done ?? it.delivered), group_label: str(it.group) || group });
    }
  };
  const comments = (module: string, recordId: string, list: unknown) => {
    for (const c of arr(list)) {
      const text = str(c.text);
      if (!text) continue;
      const who = str(c.author);
      const when = ts(c.createdAt ?? c.at);
      push("comments", { module, record_id: recordId, body: `${who ? `${who}: ` : ""}${text}`, created_at: when ?? new Date().toISOString() });
    }
  };

  // ---------- Parceiros (antes de tudo: contratos, patrocínios e mídia apontam para eles)
  for (const p of arr(data["mhub.partners.v1"])) {
    const company = str(p.company);
    if (!company || byName.partner.has(norm(company))) continue;
    const id = uuid();
    ids.partner.set(str(p.id), id);
    byName.partner.set(norm(company), id);
    push("partners", {
      id, company, category: str(p.category) || "Fornecedor", status: oneOf(p.status, ["Prospect", "Negociação", "Ativo", "Renovação", "Inativo"], "Ativo"),
      city: str(p.city), contact_name: str(p.contact), phone: str(p.phone), whatsapp: str(p.whatsapp), email: str(p.email), document: "",
      owner_id: person(p.owner), counterparts: str(p.counterparts), investment_month: num(p.investmentMonth), expected_return: num(p.expectedReturn),
      delivered_return: num(p.deliveredReturn), notes: str(p.notes), rating: null, created_at: ts(p.createdAt),
    });
    checklist("parceiros", id, p.checklist);
  }
  const finance = (data["mhub.finance.v1"] ?? {}) as Any;
  for (const s of arr(finance.suppliers)) {
    const company = str(s.company);
    if (!company) continue;
    const existing = byName.partner.get(norm(company)) ?? (s.partnerId ? ids.partner.get(str(s.partnerId)) : undefined);
    if (existing) {
      ids.partner.set(str(s.id), existing);
      continue;
    }
    const id = uuid();
    ids.partner.set(str(s.id), id);
    byName.partner.set(norm(company), id);
    push("partners", {
      id, company, category: str(s.category) || "Fornecedor", status: "Ativo", city: str(s.city), contact_name: str(s.contact), phone: str(s.phone),
      whatsapp: "", email: str(s.email), document: "", owner_id: null, counterparts: "", investment_month: num(s.monthlyInvestment), expected_return: 0,
      delivered_return: 0, notes: strings(s.products).length ? `Produtos: ${strings(s.products).join(", ")}` : "",
      rating: Number.isInteger(s.rating) && Number(s.rating) >= 0 && Number(s.rating) <= 5 ? Number(s.rating) : null, created_at: null,
    });
  }

  // ---------- Campanhas
  for (const c of arr(data["mhub.campaigns.v1"])) {
    const name = str(c.name);
    if (!name) continue;
    const id = uuid();
    ids.campaign.set(str(c.id), id);
    byName.campaign.set(norm(name), id);
    const [start, end] = orderedRange(date(c.startDate), date(c.endDate));
    push("campaigns", {
      id, name, type: oneOf(c.type, ["Institucional", "Produto", "Sazonal", "Lançamento", "Endomarketing", "Patrocínio", "Performance"], "Institucional"),
      objective: oneOf(c.objective, ["Awareness", "Geração de leads", "Conversão", "Engajamento", "Relacionamento", "Educação"], "Awareness"),
      status: oneOf(c.status, ["Rascunho", "Planejamento", "Em andamento", "Pausada", "Concluída", "Cancelada"], "Planejamento"),
      priority: oneOf(c.priority, PRIORITIES, "Média"), description: str(c.description), notes: str(c.notes), start_date: start, end_date: end,
      owner_id: person(c.owner), products: strings(c.products), budget: num(c.budget), created_at: ts(c.createdAt),
    });
  }

  // ---------- Projetos (+ checklist, comentários e cartões do kanban do projeto)
  const projectCards: { projectId: string; campaignId: string | null; cards: Any[] }[] = [];
  for (const p of arr(data["mhub.projects.v1"])) {
    const name = str(p.name);
    if (!name) continue;
    const id = uuid();
    ids.project.set(str(p.id), id);
    const campaignId = ref(ids.campaign, byName.campaign, p.campaignId);
    push("projects", {
      id, name, campaign_id: campaignId, requester_area: str(p.area), internal_client: str(p.client), owner_id: person(p.owner),
      team_ids: personList(p.team), due_date: date(p.dueDate), status: oneOf(p.status, ["Backlog", "Em andamento", "Em revisão", "Bloqueado", "Concluído"], "Backlog"),
      priority: oneOf(p.priority, PRIORITIES, "Média"), description: str(p.description), created_at: ts(p.createdAt),
    });
    checklist("projetos", id, p.checklist);
    comments("projetos", id, p.comments);
    projectCards.push({ projectId: id, campaignId, cards: arr(p.kanban) });
  }

  // ---------- Tarefas (Kanban geral + cartões dos projetos)
  const TASK_STATUSES = ["Backlog", "Planejamento", "Em andamento", "Aguardando Aprovação", "Concluído", "Cancelado"] as const;
  const taskRow = (t: Any, extra: Row) => {
    const title = str(t.title);
    if (!title) return;
    const id = uuid();
    ids.task.set(str(t.id), id);
    const status = (extra.status as string) ?? oneOf(t.status, TASK_STATUSES, "Backlog");
    push("tasks", {
      id, title, description: "", status, priority: oneOf(t.priority, PRIORITIES, "Média"), assignee_id: person(t.assignee ?? t.owner),
      due_date: date(t.dueDate), campaign_id: ref(ids.campaign, byName.campaign, t.campaignId), project_id: ids.project.get(str(t.projectId)) ?? null,
      event_id: null, labels: strings(t.labels), position: Date.now() / 1000 + (out.tasks?.length ?? 0),
      completed_at: status === "Concluído" ? ts(t.createdAt) ?? new Date().toISOString() : null, created_at: ts(t.createdAt), ...extra,
    });
  };
  for (const t of arr(data["mhub.kanban.v1"])) taskRow(t, {});
  const COLUMN: Record<string, string> = { "A fazer": "Backlog", "Em execução": "Em andamento", Revisão: "Aguardando Aprovação", Concluído: "Concluído", Backlog: "Backlog", Fazendo: "Em andamento", Pronto: "Concluído" };
  for (const pc of projectCards) {
    for (const card of pc.cards) taskRow(card, { project_id: pc.projectId, campaign_id: pc.campaignId, status: COLUMN[str(card.column)] ?? "Backlog" });
  }

  // ---------- Calendário
  for (const e of arr(data["mhub.calendar.v2"])) {
    const title = str(e.title);
    const day = date(e.date);
    if (!title || !day) continue;
    const id = uuid();
    const owners = personList(e.owners);
    push("calendar_events", {
      id, title,
      category: oneOf(e.category, ["Campanha", "Evento", "Publicação", "Reunião", "Entrega", "Prazo", "Contrato", "Patrocínio", "Outdoor", "Rádio", "Produção de vídeo", "Aprovação"], "Reunião"),
      status: oneOf(e.status, ["Planejado", "Em andamento", "Concluído", "Atrasado", "Cancelado"], "Planejado"), priority: oneOf(e.priority, PRIORITIES, "Média"),
      event_date: day, start_time: time(e.time), duration_min: num(e.durationMin) || null, description: str(e.description),
      assignee_id: owners[0] ?? null, participant_ids: owners.slice(1), agency: str(e.agency),
      campaign_id: ref(ids.campaign, byName.campaign, e.campaignId), project_id: ids.project.get(str(e.projectId)) ?? null,
      task_id: ids.task.get(str(e.kanbanTaskId)) ?? null, created_at: null,
    });
    checklist("calendario", id, e.checklist);
    comments("calendario", id, e.comments);
  }

  // ---------- Conteúdos
  for (const c of arr(data["mhub.content.v1"])) {
    const title = str(c.title);
    if (!title) continue;
    const id = uuid();
    push("content_items", {
      id, title,
      category: oneOf(c.category, ["Legendas", "Matérias", "Roteiros", "Spot Rádio", "E-mails", "Comunicados", "Vídeos", "Stories", "Reels", "Campanhas", "Templates", "Arquivos Institucionais"], "Legendas"),
      status: oneOf(c.status, ["Rascunho", "Em revisão", "Aguardando aprovação", "Aprovado", "Publicado", "Arquivado"], "Rascunho"),
      description: str(c.description), body: str(c.body), tags: strings(c.tags), campaign_id: ref(ids.campaign, byName.campaign, c.campaignId),
      project_id: ids.project.get(str(c.projectId)) ?? null, review_note: "", created_by: person(c.author), created_at: ts(c.createdAt), updated_at: ts(c.updatedAt),
    });
  }

  // ---------- Contratos
  for (const c of arr(data["mhub.contracts.v1"])) {
    const object = str(c.object) || str(c.company);
    if (!object) continue;
    const id = uuid();
    ids.contract.set(str(c.id), id);
    const [start, end] = orderedRange(date(c.startDate), date(c.endDate));
    push("contracts", {
      id, object, partner_id: ids.partner.get(str(c.partnerId)) ?? byName.partner.get(norm(str(c.company))) ?? null, company: str(c.company),
      category: str(c.category) || "Outros", status: oneOf(c.status, ["Rascunho", "Em análise", "Assinado", "Vigente", "Renovação", "Encerrado", "Cancelado"], "Vigente"),
      value: num(c.value), cost_center: str(c.costCenter), start_date: start, end_date: end, renewal_date: date(c.renewalDate), auto_renewal: !!c.autoRenewal,
      owner_id: person(c.owner), campaign_id: null, notes: str(c.notes), created_at: ts(c.createdAt),
    });
    checklist("contratos", id, c.checklist);
  }

  // ---------- Eventos (+ checklist por grupo, cronograma, convidados, fornecedores, kanban)
  for (const e of arr(data["mhub.events.v1"])) {
    const name = str(e.name);
    if (!name) continue;
    const id = uuid();
    ids.event.set(str(e.id), id);
    byName.event.set(norm(name), id);
    push("events", {
      id, name, type: oneOf(e.type, ["Lançamento", "Assembleia", "Feira", "Patrocínio", "Ação Externa", "Treinamento", "Workshop", "Confraternização", "Inauguração"], "Ação Externa"),
      status: oneOf(e.status, ["Planejamento", "Em produção", "Confirmado", "Em andamento", "Concluído", "Cancelado"], "Planejamento"),
      priority: oneOf(e.priority, PRIORITIES, "Média"), event_date: date(e.date), end_date: null, start_time: time(e.time), city: str(e.city),
      venue: str(e.venue), agency: str(e.agency), assignee_id: person(e.owner), team_ids: personList(e.team),
      partner_ids: strings(e.partners).map((p) => ids.partner.get(p) ?? byName.partner.get(norm(p))).filter((x): x is string => !!x),
      campaign_id: ref(ids.campaign, byName.campaign, e.campaign), objective: str(e.objective), description: str(e.description), budget: num(e.budget),
      expected_audience: null, notes: [str(e.notes), str(e.sponsorship) && `Patrocínio: ${str(e.sponsorship)}`, arr(e.gifts).length ? `Brindes previstos: ${arr(e.gifts).map((g) => `${str(g.name)} (${num(g.quantity)})`).join(", ")}` : ""].filter(Boolean).join("\n"),
      created_at: ts(e.createdAt),
    });
    checklist("eventos", id, e.checklist);
    for (const s of arr(e.schedule)) if (str(s.title)) push("event_schedule", { event_id: id, starts_at: time(s.time), title: str(s.title), owner_id: person(s.owner) });
    for (const a of arr(e.attendees)) if (str(a.name)) push("event_attendees", { event_id: id, name: str(a.name), role: str(a.role), confirmed: !!a.confirmed });
    for (const s of arr(e.suppliers)) if (str(s.name)) push("event_suppliers", { event_id: id, name: str(s.name), service: str(s.service), contact: str(s.contact), partner_id: byName.partner.get(norm(str(s.name))) ?? null });
    for (const k of arr(e.kanban)) taskRow(k, { event_id: id, campaign_id: ref(ids.campaign, byName.campaign, e.campaign), status: COLUMN[str(k.column)] ?? "Backlog" });
  }

  // ---------- Patrocínios
  for (const s of arr(data["mhub.sponsorships.v1"])) {
    const event_name = str(s.event) || str(s.institution);
    if (!event_name) continue;
    const id = uuid();
    const [start, end] = orderedRange(date(s.startDate), date(s.endDate));
    push("sponsorships", {
      id, event_name, institution: str(s.institution), city: str(s.city),
      category: oneOf(s.category, ["Esportivo", "Cultural", "Social", "Educacional", "Agronegócio", "Religioso", "Empresarial"], "Social"),
      tier: oneOf(s.type, ["Master", "Ouro", "Prata", "Bronze", "Apoio", "Permuta"], "Apoio"),
      status: oneOf(s.status, ["Em negociação", "Confirmado", "Em execução", "Concluído", "Cancelado"], "Confirmado"),
      value: num(s.value), start_date: start, end_date: end, owner_id: person(s.owner), partner_id: null,
      contract_id: ids.contract.get(str(s.contractId)) ?? null, event_id: ids.event.get(str(s.eventId)) ?? byName.event.get(norm(str(s.event))) ?? null,
      campaign_id: ref(ids.campaign, byName.campaign, s.campaignId ?? s.campaign), materials_deadline: date(s.materialsDeadline),
      counterparts_deadline: date(s.counterpartsDeadline), accounting_deadline: date(s.accountingDeadline), report_summary: str(s.reportSummary),
      expected_return: num(s.expectedReturn), delivered_return: num(s.deliveredReturn),
      notes: [str(s.notes), str(s.contractRef) && `Contrato: ${str(s.contractRef)}`].filter(Boolean).join("\n"), created_at: ts(s.createdAt),
    });
    checklist("patrocinios", id, s.counterparts, "Contrapartidas");
    checklist("patrocinios", id, s.checklist);
  }

  // ---------- Mídia offline
  for (const m of arr(data["mhub.offline-media.v1"])) {
    const title = str(m.title);
    if (!title) continue;
    const [inst, rem] = orderedRange(date(m.installDate), date(m.removalDate));
    push("offline_media", {
      title, categories: strings(m.categories).length ? strings(m.categories) : strings([m.category]),
      status: oneOf(m.status, ["Planejado", "Arte em produção", "Aguardando instalação", "Instalado", "Retirado", "Cancelado"], "Planejado"),
      city: str(m.city), location: str(m.location), supplier: str(m.supplier), partner_id: byName.partner.get(norm(str(m.supplier))) ?? null,
      campaign_id: ref(ids.campaign, byName.campaign, m.campaignId ?? m.campaign), project_id: ids.project.get(str(m.projectId)) ?? null,
      install_date: inst, removal_date: rem, owner_id: person(m.owner), value: num(m.value), cost_center: str(m.costCenter), notes: str(m.notes),
      created_at: ts(m.createdAt),
    });
  }

  // ---------- Brindes (saldo atual; o histórico de movimentações antigo não é trazido)
  for (const i of arr(data["mhub.inventory.v1"])) {
    const name = str(i.name);
    if (!name) continue;
    const quantity = Math.max(0, Math.round(num(i.quantity)));
    push("inventory_items", {
      code: str(i.internalCode), name,
      category: oneOf(i.category, ["Vestuário", "Papelaria", "Tecnologia", "Bebidas", "Alimentos", "Acessórios", "Decoração", "Material gráfico", "Kits institucionais", "Outros"], "Outros"),
      supplier: str(i.supplier), location: str(i.location), unit_value: num(i.unitValue), min_quantity: Math.round(num(i.minQuantity)),
      quantity, reserved: Math.min(quantity, Math.round(num(i.reserved))), notes: str(i.notes), created_at: ts(i.createdAt),
    });
  }
  if (arr(data["mhub.inventory.v1"]).some((i) => arr(i.movements).length)) warnings.push("Brindes: o saldo atual foi trazido; o histórico de movimentações antigo não.");

  // ---------- Financeiro
  const year = Number(finance.year) || new Date().getFullYear();
  const existingCodes = new Map(existingCostCenters.map((c) => [norm(c.code), c.id]));
  for (const c of arr(finance.costCenters)) {
    const code = str(c.code);
    if (!code) continue;
    const found = existingCodes.get(norm(code));
    if (found) {
      ids.cc.set(str(c.id), found);
      continue;
    }
    const id = uuid();
    ids.cc.set(str(c.id), id);
    existingCodes.set(norm(code), id);
    push("cost_centers", { id, code, name: str(c.name) || code, responsible_id: person(c.responsible), active: c.active !== false });
  }
  for (const b of arr(finance.budget)) {
    if (!str(b.category)) continue;
    push("budget_lines", { year, category: str(b.category), cost_center_id: null, planned: num(b.planned), approved: num(b.approved), notes: "Importado do app antigo" });
  }
  const METHODS = ["Boleto", "PIX", "Cartão Corporativo", "Transferência", "Dinheiro"] as const;
  for (const e of arr(finance.expenses)) {
    if (!str(e.description)) continue;
    push("expenses", {
      description: str(e.description), expense_category: str(e.category) || "Outros", budget_category: "",
      cost_center_id: ids.cc.get(str(e.costCenterId)) ?? null, partner_id: ids.partner.get(str(e.supplierId)) ?? null,
      campaign_id: ref(ids.campaign, byName.campaign, e.campaignId), quantity: num(e.quantity) || 1, unit_value: num(e.unitValue),
      expense_date: date(e.date) ?? new Date().toISOString().slice(0, 10), payment_method: oneOf(e.paymentMethod, METHODS, "Boleto"),
      owner_id: person(e.owner), notes: str(e.notes), created_at: ts(e.createdAt),
    });
  }
  if (arr(finance.expenses).length) warnings.push("Despesas: confira a categoria do orçamento de cada uma (o app antigo não guardava essa ligação).");
  for (const p of arr(finance.purchaseRequests)) {
    if (!str(p.description)) continue;
    push("purchase_requests", {
      code: str(p.code), description: str(p.description), justification: str(p.justification), requester_id: person(p.requester),
      partner_id: ids.partner.get(str(p.supplierId)) ?? null, cost_center_id: ids.cc.get(str(p.costCenterId)) ?? null, budget_category: "",
      campaign_id: ref(ids.campaign, byName.campaign, p.campaignId), project_id: ids.project.get(str(p.projectId)) ?? null,
      estimated_value: num(p.estimatedValue), urgency: oneOf(p.urgency, ["Baixa", "Média", "Alta", "Urgente"], "Média"),
      status: oneOf(p.status, ["Rascunho", "Solicitado", "Em aprovação", "Aprovado", "Comprado", "Recebido", "Concluído", "Recusado", "Cancelado"], "Rascunho"),
      created_at: ts(p.createdAt),
    });
  }
  for (const i of arr(finance.invoices)) {
    const number = str(i.number);
    if (!number || num(i.value) <= 0) continue;
    const id = uuid();
    ids.invoice.set(str(i.id), id);
    push("invoices", {
      id, number, partner_id: ids.partner.get(str(i.supplierId)) ?? null, supplier_name: "", issue_date: date(i.date) ?? new Date().toISOString().slice(0, 10),
      due_date: date(i.dueDate), value: num(i.value), expense_category: str(i.category) || "Outros", budget_category: "",
      cost_center_id: ids.cc.get(str(i.costCenterId)) ?? null, campaign_id: ref(ids.campaign, byName.campaign, i.campaignId),
      project_id: ids.project.get(str(i.projectId)) ?? null, event_id: ids.event.get(str(i.eventId)) ?? null,
      status: oneOf(i.status, ["Pendente", "Aprovada", "Paga", "Cancelada"], "Pendente"), notes: str(i.notes),
    });
  }
  for (const p of arr(finance.payments)) {
    if (!str(p.description) || num(p.value) <= 0) continue;
    const st = str(p.status);
    push("payments", {
      description: str(p.description), invoice_id: ids.invoice.get(str(p.invoiceId)) ?? null, partner_id: ids.partner.get(str(p.supplierId)) ?? null,
      value: num(p.value), due_date: date(p.dueDate) ?? new Date().toISOString().slice(0, 10), paid_at: st === "Pago" ? date(p.paidAt) ?? date(p.dueDate) : null,
      method: oneOf(p.method, METHODS, "Boleto"), status: st === "Pago" ? "Pago" : st === "Cancelado" ? "Cancelado" : "Agendado", notes: "",
    });
  }

  // ---------- Planejamento estratégico
  for (const plan of arr(data["mhub.strategic.v1"])) {
    const planYear = Number(plan.year) || year;
    const objMap = new Map<string, string>();
    for (const o of arr(plan.objectives)) {
      if (!str(o.title)) continue;
      const id = uuid();
      objMap.set(str(o.id), id);
      push("strategic_objectives", {
        id, year: planYear, title: str(o.title), description: str(o.description), perspective: "Negócios",
        status: plan.status === "Concluído" ? "Concluído" : plan.status === "Em execução" ? "Em andamento" : "Planejado", owner_id: person(plan.owner),
      });
      for (const cid of strings(o.campaignIds)) {
        const newId = ids.campaign.get(cid);
        const c = out.campaigns?.find((x) => x.id === newId);
        if (c) c.objective_id = id;
      }
    }
    for (const g of arr(plan.goals)) {
      const objective_id = objMap.get(str(g.objectiveId));
      if (!objective_id || !str(g.description)) continue;
      push("key_results", {
        objective_id, title: str(g.description), unit: str(g.unit), baseline: 0, target: num(g.target), current: num(g.current),
        indicator_id: null, owner_id: person(g.owner), due_date: date(g.deadline),
      });
    }
  }

  if (unmatched.size) {
    warnings.push(`Pessoas não encontradas entre os usuários (ficaram sem responsável): ${[...unmatched].slice(0, 15).join(", ")}${unmatched.size > 15 ? "…" : ""}. Cadastre-as antes, se quiser o vínculo.`);
  }
  if (data["mhub.workflows.v1"] || data["mh:ai-center:v1"] || data["mh.notifications.v1"]) {
    warnings.push("Workflows, conversas da Central IA e notificações antigas não são importados (as regras novas rodam no servidor).");
  }
  warnings.push("Arquivos anexados no app antigo não vêm no backup (só o nome deles era salvo). Anexe de novo os documentos importantes.");

  // Garante as mesmas chaves em todas as linhas de cada tabela (o banco usa a primeira linha como modelo)
  const LABELS: Record<string, string> = {
    partners: "Parceiros e fornecedores", campaigns: "Campanhas", projects: "Projetos", tasks: "Tarefas", calendar_events: "Calendário",
    content_items: "Conteúdos", contracts: "Contratos", events: "Eventos", event_schedule: "Cronogramas", event_attendees: "Convidados",
    event_suppliers: "Fornecedores de eventos", sponsorships: "Patrocínios", offline_media: "Mídia offline", inventory_items: "Brindes",
    cost_centers: "Centros de custo", budget_lines: "Orçamento", expenses: "Despesas", purchase_requests: "Solicitações de compra",
    invoices: "Notas fiscais", payments: "Pagamentos", strategic_objectives: "Objetivos estratégicos", key_results: "Resultados-chave",
    checklist_items: "Itens de checklist", comments: "Comentários",
  };
  const ORDER = [
    "partners", "cost_centers", "campaigns", "strategic_objectives", "key_results", "projects", "events", "tasks", "calendar_events",
    "content_items", "contracts", "event_schedule", "event_attendees", "event_suppliers", "sponsorships", "offline_media", "inventory_items",
    "budget_lines", "purchase_requests", "invoices", "payments", "expenses", "checklist_items", "comments",
  ];
  // Objetivos precisam existir antes das campanhas que apontam para eles
  ORDER.splice(ORDER.indexOf("strategic_objectives"), 1);
  ORDER.splice(ORDER.indexOf("campaigns"), 0, "strategic_objectives");

  const tables = ORDER.filter((t) => out[t]?.length).map((t) => {
    const keys = [...new Set(out[t].flatMap((r) => Object.keys(r)))];
    const rows = out[t].map((r) => {
      const full: Row = {};
      for (const k of keys) {
        const v = r[k];
        if (v === undefined || (v === null && (k === "created_at" || k === "updated_at"))) continue;
        full[k] = v;
      }
      return full;
    });
    return { table: t, label: LABELS[t] ?? t, rows };
  });
  // Linhas sem created_at recebem a data de agora no banco
  return { tables, warnings };
}

/** Grava o plano tabela a tabela, em lotes. */
export async function runPlan(plan: ImportPlan, onProgress: (label: string, done: number, total: number) => void) {
  const results: { label: string; sent: number; inserted: number }[] = [];
  for (const t of plan.tables) {
    let inserted = 0;
    for (let i = 0; i < t.rows.length; i += 200) {
      const chunk = t.rows.slice(i, i + 200);
      const { data, error } = await supabase.rpc("import_rows", { _table: t.table, _rows: chunk as unknown as Json });
      if (error) throw new Error(`${t.label}: ${error.message}`);
      inserted += Number(data ?? 0);
      onProgress(t.label, Math.min(i + 200, t.rows.length), t.rows.length);
    }
    results.push({ label: t.label, sent: t.rows.length, inserted });
  }
  return results;
}

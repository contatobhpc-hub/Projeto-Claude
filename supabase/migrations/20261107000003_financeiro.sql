-- =============================================================================
-- Marketing Hub 2.0 — Fase 4: Financeiro
-- Centros de custo, orçamento anual, solicitações de compra (com alçada de
-- aprovação), notas fiscais, pagamentos e despesas realizadas.
--
-- Fluxo: Solicitação de compra → aprovação (Gestor; acima da alçada, também
-- Diretoria) → Nota fiscal → aprovação da nota → Pagamento agendado →
-- Pago → Despesa realizada (lançada automaticamente).
-- Fornecedores são os Parceiros (tabela partners).
-- =============================================================================

insert into public.app_settings (key, value) values
  ('finance', jsonb_build_object(
    'purchase_approval_limit', 5000,
    'budget_categories', jsonb_build_array('Campanhas Comerciais','Campanhas Institucionais','Eventos','Patrocínios','Brindes',
                                           'Mídia Offline','Tráfego Pago','Endomarketing','Treinamentos','Comunicação Institucional'),
    'expense_categories', jsonb_build_array('Outdoor','Rádio','Vídeo','Fotografia','Brindes','Coffee Break','Locação','Impresso',
                                            'Facebook Ads','Google Ads','Produção','Eventos','Outros')
  ))
on conflict (key) do nothing;

-- Fornecedor: avaliação de 0 a 5 (usado no Financeiro)
alter table public.partners add column rating smallint check (rating is null or rating between 0 and 5);

-- -----------------------------------------------------------------------------
-- Centros de custo
-- -----------------------------------------------------------------------------
create table public.cost_centers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null check (length(trim(code)) > 0),
  name           text not null check (length(trim(name)) > 0),
  responsible_id uuid references public.profiles(id) on delete set null,
  active         boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create unique index cost_centers_code_idx on public.cost_centers(lower(code)) where deleted_at is null;

insert into public.cost_centers (code, name) values
  ('CC-INST','Institucional'), ('CC-PROD','Produtos'), ('CC-EVT','Eventos'), ('CC-PAT','Patrocínios'),
  ('CC-BRI','Brindes'), ('CC-OUT','Outdoor'), ('CC-TV','TV'), ('CC-RAD','Rádio'), ('CC-DIG','Digital'), ('CC-TRE','Treinamentos');

-- -----------------------------------------------------------------------------
-- Orçamento anual por categoria (e opcionalmente por centro de custo)
-- "planned" = proposto pela equipe; "approved" = aprovado (só aprovadores mudam)
-- -----------------------------------------------------------------------------
create table public.budget_lines (
  id             uuid primary key default gen_random_uuid(),
  year           int not null check (year between 2000 and 2100),
  category       text not null check (length(trim(category)) > 0),
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  planned        numeric(14,2) not null default 0 check (planned >= 0),
  approved       numeric(14,2) not null default 0 check (approved >= 0),
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_at    timestamptz,
  notes          text not null default '',
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create unique index budget_lines_unique_idx on public.budget_lines
  (year, lower(category), coalesce(cost_center_id, '00000000-0000-0000-0000-000000000000'::uuid)) where deleted_at is null;

create or replace function public.guard_budget_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.approved > 0 and auth.uid() is not null and not public.has_perm('fin_orcamento', 'approve') then
      new.approved := 0;
    end if;
  elsif new.approved is distinct from old.approved then
    if auth.uid() is not null and not public.has_perm('fin_orcamento', 'approve') then
      raise exception 'Só aprovadores alteram o valor aprovado do orçamento.' using errcode = '42501';
    end if;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    return new;
  end if;
  if new.approved > 0 then
    new.approved_by := auth.uid(); new.approved_at := now();
  else
    new.approved_by := null; new.approved_at := null;
  end if;
  return new;
end;
$$;
create trigger budget_lines_approval before insert or update on public.budget_lines
  for each row execute function public.guard_budget_approval();

-- -----------------------------------------------------------------------------
-- Solicitações de compra
-- -----------------------------------------------------------------------------
create sequence public.purchase_request_seq;

create table public.purchase_requests (
  id               uuid primary key default gen_random_uuid(),
  code             text not null default '',
  description      text not null check (length(trim(description)) > 0),
  justification    text not null default '',
  requester_id     uuid references public.profiles(id) on delete set null default auth.uid(),
  partner_id       uuid references public.partners(id) on delete set null,      -- fornecedor sugerido
  cost_center_id   uuid references public.cost_centers(id) on delete set null,
  budget_category  text not null default '',
  campaign_id      uuid references public.campaigns(id) on delete set null,
  project_id       uuid references public.projects(id) on delete set null,
  event_id         uuid references public.events(id) on delete set null,
  estimated_value  numeric(14,2) not null default 0 check (estimated_value >= 0),
  final_value      numeric(14,2) check (final_value is null or final_value >= 0),
  urgency          text not null default 'Média' check (urgency in ('Baixa','Média','Alta','Urgente')),
  needed_by        date,
  status           text not null default 'Rascunho'
                   check (status in ('Rascunho','Solicitado','Em aprovação','Aprovado','Comprado','Recebido','Concluído','Recusado','Cancelado')),
  decision_note    text not null default '',
  submitted_at     timestamptz,
  decided_at       timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index purchase_requests_code_idx on public.purchase_requests(code);
create index purchase_requests_status_idx on public.purchase_requests(status) where deleted_at is null;

-- Registro de cada decisão (quem aprovou/recusou, em que nível)
create table public.purchase_approvals (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.purchase_requests(id) on delete cascade,
  level       text not null check (level in ('Gestor','Diretoria')),
  decision    text not null check (decision in ('Aprovado','Recusado')),
  note        text not null default '',
  decided_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  decided_at  timestamptz not null default now()
);
create index purchase_approvals_req_idx on public.purchase_approvals(request_id, decided_at);
alter table public.purchase_approvals enable row level security;
create policy purchase_approvals_read on public.purchase_approvals for select to authenticated
  using (public.has_perm('fin_compras', 'view'));
-- Sem escrita direta: só a função decide_purchase grava.

create or replace function public.purchase_request_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  new.code := 'PC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.purchase_request_seq')::text, 4, '0');
  if auth.uid() is not null then new.requester_id := auth.uid(); end if;
  if new.status not in ('Rascunho', 'Solicitado') then new.status := 'Rascunho'; end if;
  if new.status = 'Solicitado' then new.submitted_at := now(); end if;
  return new;
end;
$$;
create trigger purchase_request_defaults before insert on public.purchase_requests
  for each row execute function public.purchase_request_defaults();

-- Regras de mudança (fora da função de decisão):
--  * dados só mudam em Rascunho/Solicitado (depois, só pela decisão ou valor final na compra);
--  * solicitante: Rascunho ↔ Solicitado e Cancelar;
--  * quem edita compras: Aprovado → Comprado → Recebido → Concluído, e Cancelar;
--  * Aprovado / Recusado / Em aprovação só pela função decide_purchase.
create or replace function public.guard_purchase_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  editor boolean := public.has_perm('fin_compras', 'edit');
  is_requester boolean := old.requester_id = auth.uid();
  data_changed boolean;
begin
  if auth.uid() is null or coalesce(current_setting('mhub.pr_tx', true), '') = '1' then
    return new;
  end if;
  new.code := old.code;
  new.requester_id := old.requester_id;

  data_changed := (new.description, new.justification, new.partner_id, new.cost_center_id, new.budget_category,
                   new.campaign_id, new.project_id, new.event_id, new.estimated_value, new.urgency, new.needed_by)
                  is distinct from
                  (old.description, old.justification, old.partner_id, old.cost_center_id, old.budget_category,
                   old.campaign_id, old.project_id, old.event_id, old.estimated_value, old.urgency, old.needed_by);
  if data_changed and old.status not in ('Rascunho', 'Solicitado') then
    raise exception 'Depois de enviada para aprovação, a solicitação não pode ser alterada. Cancele e crie outra.' using errcode = '42501';
  end if;
  if data_changed and not (editor or is_requester) then
    raise exception 'Só o solicitante ou quem gerencia compras altera esta solicitação.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status in ('Aprovado', 'Recusado', 'Em aprovação') then
      raise exception 'Aprovações são feitas pelo botão Aprovar/Recusar.' using errcode = '42501';
    end if;
    if not (
      (is_requester and old.status = 'Rascunho' and new.status = 'Solicitado') or
      (is_requester and old.status = 'Solicitado' and new.status = 'Rascunho') or
      ((is_requester or editor) and old.status in ('Rascunho', 'Solicitado') and new.status = 'Cancelado') or
      (editor and old.status = 'Aprovado' and new.status in ('Comprado', 'Cancelado')) or
      (editor and old.status = 'Comprado' and new.status in ('Recebido', 'Cancelado')) or
      (editor and old.status = 'Recebido' and new.status = 'Concluído')
    ) then
      raise exception 'Mudança de status não permitida: % → %.', old.status, new.status using errcode = '42501';
    end if;
    if new.status = 'Solicitado' then new.submitted_at := now(); end if;
  end if;

  if new.final_value is distinct from old.final_value and not editor then
    raise exception 'Só quem gerencia compras informa o valor final.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger purchase_request_guard before update on public.purchase_requests
  for each row execute function public.guard_purchase_request();

-- Decisão com alçada:
--  * quem pediu não aprova o próprio pedido (segregação de funções);
--  * até o limite (app_settings.finance.purchase_approval_limit): uma aprovação basta;
--  * acima do limite: depois do Gestor, precisa da Diretoria (ou Administrador).
create or replace function public.decide_purchase(_id uuid, _decision text, _note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare
  pr purchase_requests%rowtype;
  role_key text;
  lim numeric;
  lvl text;
  next_status text;
begin
  if _decision not in ('Aprovado', 'Recusado') then raise exception 'Decisão inválida.'; end if;
  if not public.has_perm('fin_compras', 'approve') then
    raise exception 'Seu cargo não aprova compras.' using errcode = '42501';
  end if;
  select * into pr from purchase_requests where id = _id and deleted_at is null for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if pr.status not in ('Solicitado', 'Em aprovação') then
    raise exception 'Esta solicitação não está aguardando aprovação.';
  end if;
  if pr.requester_id = auth.uid() then
    raise exception 'Quem fez o pedido não pode aprová-lo.' using errcode = '42501';
  end if;
  if exists (select 1 from purchase_approvals where request_id = _id and decided_by = auth.uid()) then
    raise exception 'Você já decidiu sobre esta solicitação.' using errcode = '42501';
  end if;

  select r.key into role_key from profiles p join roles r on r.id = p.role_id where p.id = auth.uid();
  lvl := case when role_key in ('diretoria', 'admin') then 'Diretoria' else 'Gestor' end;
  select coalesce((value->>'purchase_approval_limit')::numeric, 0) into lim from app_settings where key = 'finance';

  if pr.status = 'Em aprovação' and lvl <> 'Diretoria' then
    raise exception 'Esta solicitação passou da alçada e aguarda a Diretoria.' using errcode = '42501';
  end if;

  if _decision = 'Recusado' then
    next_status := 'Recusado';
  elsif lvl = 'Diretoria' or pr.estimated_value <= coalesce(lim, 0) then
    next_status := 'Aprovado';
  else
    next_status := 'Em aprovação';
  end if;

  insert into purchase_approvals (request_id, level, decision, note, decided_by)
  values (_id, lvl, _decision, coalesce(_note, ''), auth.uid());

  perform set_config('mhub.pr_tx', '1', true);
  update purchase_requests
     set status = next_status,
         decision_note = coalesce(_note, ''),
         decided_at = case when next_status in ('Aprovado', 'Recusado') then now() else decided_at end
   where id = _id;
  perform set_config('mhub.pr_tx', '', true);
  return next_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notas fiscais
-- -----------------------------------------------------------------------------
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  number              text not null check (length(trim(number)) > 0),
  partner_id          uuid references public.partners(id) on delete set null,
  supplier_name       text not null default '',
  issue_date          date not null default current_date,
  due_date            date,
  value               numeric(14,2) not null check (value > 0),
  expense_category    text not null default 'Outros',
  budget_category     text not null default '',
  cost_center_id      uuid references public.cost_centers(id) on delete set null,
  campaign_id         uuid references public.campaigns(id) on delete set null,
  project_id          uuid references public.projects(id) on delete set null,
  event_id            uuid references public.events(id) on delete set null,
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  payment_method      text not null default 'Boleto' check (payment_method in ('Boleto','PIX','Cartão Corporativo','Transferência','Dinheiro')),
  status              text not null default 'Pendente' check (status in ('Pendente','Aprovada','Paga','Cancelada')),
  approved_by         uuid references public.profiles(id) on delete set null,
  approved_at         timestamptz,
  notes               text not null default '',
  created_by          uuid references auth.users(id) on delete set null,
  updated_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create unique index invoices_number_idx on public.invoices
  (lower(number), coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(supplier_name)) where deleted_at is null;
create index invoices_status_idx on public.invoices(status) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Pagamentos
-- -----------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  description  text not null check (length(trim(description)) > 0),
  invoice_id   uuid references public.invoices(id) on delete set null,
  partner_id   uuid references public.partners(id) on delete set null,
  value        numeric(14,2) not null check (value > 0),
  due_date     date not null,
  paid_at      date,
  method       text not null default 'Boleto' check (method in ('Boleto','PIX','Cartão Corporativo','Transferência','Dinheiro')),
  status       text not null default 'Agendado' check (status in ('Agendado','Pago','Cancelado')),
  paid_by      uuid references public.profiles(id) on delete set null,
  notes        text not null default '',
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index payments_due_idx on public.payments(due_date) where deleted_at is null and status = 'Agendado';
create unique index payments_invoice_idx on public.payments(invoice_id) where invoice_id is not null and deleted_at is null and status <> 'Cancelado';

-- -----------------------------------------------------------------------------
-- Despesas realizadas (base do "Realizado" do orçamento)
-- -----------------------------------------------------------------------------
create table public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  description         text not null check (length(trim(description)) > 0),
  expense_category    text not null default 'Outros',
  budget_category     text not null default '',
  cost_center_id      uuid references public.cost_centers(id) on delete set null,
  partner_id          uuid references public.partners(id) on delete set null,
  campaign_id         uuid references public.campaigns(id) on delete set null,
  project_id          uuid references public.projects(id) on delete set null,
  event_id            uuid references public.events(id) on delete set null,
  invoice_id          uuid references public.invoices(id) on delete set null,
  payment_id          uuid references public.payments(id) on delete set null,
  quantity            numeric(12,2) not null default 1 check (quantity > 0),
  unit_value          numeric(14,2) not null check (unit_value >= 0),
  total               numeric(14,2) generated always as (round(quantity * unit_value, 2)) stored,
  expense_date        date not null default current_date,
  payment_method      text not null default 'Boleto' check (payment_method in ('Boleto','PIX','Cartão Corporativo','Transferência','Dinheiro')),
  owner_id            uuid references public.profiles(id) on delete set null,
  notes               text not null default '',
  created_by          uuid references auth.users(id) on delete set null,
  updated_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index expenses_date_idx on public.expenses(expense_date) where deleted_at is null;
create index expenses_budget_idx on public.expenses(budget_category, cost_center_id) where deleted_at is null;
create unique index expenses_payment_idx on public.expenses(payment_id) where payment_id is not null and deleted_at is null;

-- Nota: aprovar exige "Aprovar" no Financeiro; ao aprovar, agenda o pagamento.
-- "Paga" só pelo pagamento.
create or replace function public.invoice_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Pendente' and auth.uid() is not null then new.status := 'Pendente'; end if;
    new.approved_by := null; new.approved_at := null;
    return new;
  end if;
  if coalesce(current_setting('mhub.fin_tx', true), '') = '1' or auth.uid() is null then
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'Aprovada' then
      if old.status <> 'Pendente' then raise exception 'Só notas pendentes podem ser aprovadas.'; end if;
      if not public.has_perm('fin_orcamento', 'approve') then
        raise exception 'Seu cargo não aprova notas fiscais.' using errcode = '42501';
      end if;
      new.approved_by := auth.uid(); new.approved_at := now();
    elsif new.status = 'Paga' then
      raise exception 'A nota fica "Paga" quando o pagamento é registrado.' using errcode = '42501';
    elsif new.status = 'Pendente' then
      if not public.has_perm('fin_orcamento', 'approve') then
        raise exception 'Seu cargo não reabre notas aprovadas.' using errcode = '42501';
      end if;
      if exists (select 1 from payments where invoice_id = old.id and status = 'Pago' and deleted_at is null) then
        raise exception 'Nota já paga não pode voltar para pendente.';
      end if;
      new.approved_by := null; new.approved_at := null;
    elsif new.status = 'Cancelada' then
      if exists (select 1 from payments where invoice_id = old.id and status = 'Pago' and deleted_at is null) then
        raise exception 'Nota já paga não pode ser cancelada.';
      end if;
    end if;
  elsif old.status in ('Aprovada', 'Paga') and (new.value, new.partner_id, new.number) is distinct from (old.value, old.partner_id, old.number) then
    raise exception 'Valor, fornecedor e número de nota aprovada não podem mudar.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger invoice_workflow before insert or update on public.invoices
  for each row execute function public.invoice_workflow();

create or replace function public.invoice_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Aprovada' and old.status is distinct from 'Aprovada'
     and not exists (select 1 from payments where invoice_id = new.id and deleted_at is null and status <> 'Cancelado') then
    insert into payments (description, invoice_id, partner_id, value, due_date, method)
    values ('NF ' || new.number || coalesce(' — ' || nullif(new.supplier_name, ''), ''),
            new.id, new.partner_id, new.value, coalesce(new.due_date, current_date + 7), new.payment_method);
  elsif new.status in ('Cancelada', 'Pendente') and old.status = 'Aprovada' then
    update payments set status = 'Cancelado' where invoice_id = new.id and status = 'Agendado';
  end if;
  return new;
end;
$$;
create trigger invoice_after after update of status on public.invoices
  for each row execute function public.invoice_after();

-- Pagamento: ao marcar "Pago", a nota vira "Paga" e a despesa é lançada.
create or replace function public.payment_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'Pago' and new.status <> 'Pago' and auth.uid() is not null
     and not public.has_perm('fin_orcamento', 'approve') then
    raise exception 'Só aprovadores estornam um pagamento.' using errcode = '42501';
  end if;
  if new.status = 'Pago' and (tg_op = 'INSERT' or old.status <> 'Pago') then
    new.paid_at := coalesce(new.paid_at, current_date);
    new.paid_by := auth.uid();
  elsif new.status <> 'Pago' then
    new.paid_at := null; new.paid_by := null;
  end if;
  return new;
end;
$$;
create trigger payment_workflow before insert or update on public.payments
  for each row execute function public.payment_workflow();

create or replace function public.payment_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv invoices%rowtype;
begin
  if new.status = 'Pago' and (tg_op = 'INSERT' or old.status <> 'Pago') then
    if new.invoice_id is not null then
      select * into inv from invoices where id = new.invoice_id;
      perform set_config('mhub.fin_tx', '1', true);
      update invoices set status = 'Paga' where id = new.invoice_id;
      perform set_config('mhub.fin_tx', '', true);
    end if;
    if not exists (select 1 from expenses where payment_id = new.id and deleted_at is null) then
      insert into expenses (description, expense_category, budget_category, cost_center_id, partner_id, campaign_id,
                            project_id, event_id, invoice_id, payment_id, quantity, unit_value, expense_date, payment_method, owner_id)
      values (new.description, coalesce(inv.expense_category, 'Outros'), coalesce(inv.budget_category, ''), inv.cost_center_id,
              coalesce(new.partner_id, inv.partner_id), inv.campaign_id, inv.project_id, inv.event_id, new.invoice_id, new.id,
              1, new.value, new.paid_at, new.method, auth.uid());
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'Pago' and new.status <> 'Pago' then
    -- Estorno: despesa vai para a lixeira e a nota volta para Aprovada
    update expenses set deleted_at = now() where payment_id = new.id and deleted_at is null;
    if new.invoice_id is not null then
      perform set_config('mhub.fin_tx', '1', true);
      update invoices set status = 'Aprovada' where id = new.invoice_id and status = 'Paga';
      perform set_config('mhub.fin_tx', '', true);
    end if;
  end if;
  return new;
end;
$$;
create trigger payment_after after insert or update of status on public.payments
  for each row execute function public.payment_after();

-- -----------------------------------------------------------------------------
-- Registro no padrão (permissões da matriz, lixeira, histórico)
-- -----------------------------------------------------------------------------
select public.register_module_table('public.cost_centers', 'fin_orcamento', 'name');
select public.register_module_table('public.budget_lines', 'fin_orcamento', 'category');
select public.register_module_table('public.invoices', 'fin_orcamento', 'number');
select public.register_module_table('public.payments', 'fin_orcamento', 'description');
select public.register_module_table('public.expenses', 'fin_orcamento', 'description');
select public.register_module_table('public.purchase_requests', 'fin_compras', 'description');

-- Solicitante (cargo com "Criar" em compras, ex.: Analista) vê e altera os próprios pedidos
create policy purchase_requests_requester_update on public.purchase_requests for update to authenticated
  using (requester_id = auth.uid() and public.has_perm('fin_compras', 'create'))
  with check (requester_id = auth.uid());

-- Centros de custo ficam visíveis para quem faz pedidos de compra (para escolher)
create policy cost_centers_for_requesters on public.cost_centers for select to authenticated
  using (deleted_at is null and public.has_perm('fin_compras', 'view'));

create trigger audit_purchase_approvals after insert on public.purchase_approvals
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Visão do orçamento: aprovado × comprometido × realizado
--   comprometido = compras aprovadas ainda sem nota + notas pendentes/aprovadas não pagas
--   realizado    = despesas do ano
-- -----------------------------------------------------------------------------
create or replace function public.budget_overview(_year int)
returns table (category text, cost_center_id uuid, planned numeric, approved numeric, committed numeric, spent numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('fin_orcamento', 'view') then
    raise exception 'Sem acesso ao orçamento.' using errcode = '42501';
  end if;
  return query
  with keys as (
    select b.category as cat, b.cost_center_id as cc from budget_lines b where b.year = _year and b.deleted_at is null
    union
    select e.budget_category, e.cost_center_id from expenses e
      where extract(year from e.expense_date) = _year and e.deleted_at is null and e.budget_category <> ''
    union
    select i.budget_category, i.cost_center_id from invoices i
      where extract(year from i.issue_date) = _year and i.deleted_at is null and i.status in ('Pendente', 'Aprovada') and i.budget_category <> ''
    union
    select p.budget_category, p.cost_center_id from purchase_requests p
      where extract(year from p.created_at) = _year and p.deleted_at is null and p.status in ('Aprovado', 'Comprado', 'Recebido') and p.budget_category <> ''
  )
  select k.cat, k.cc,
    coalesce((select sum(b.planned)  from budget_lines b where b.year = _year and b.deleted_at is null and lower(b.category) = lower(k.cat) and b.cost_center_id is not distinct from k.cc), 0),
    coalesce((select sum(b.approved) from budget_lines b where b.year = _year and b.deleted_at is null and lower(b.category) = lower(k.cat) and b.cost_center_id is not distinct from k.cc), 0),
    coalesce((select sum(i.value) from invoices i
              where extract(year from i.issue_date) = _year and i.deleted_at is null and i.status in ('Pendente', 'Aprovada')
                and lower(i.budget_category) = lower(k.cat) and i.cost_center_id is not distinct from k.cc), 0)
    + coalesce((select sum(coalesce(p.final_value, p.estimated_value)) from purchase_requests p
              where extract(year from p.created_at) = _year and p.deleted_at is null and p.status in ('Aprovado', 'Comprado', 'Recebido')
                and lower(p.budget_category) = lower(k.cat) and p.cost_center_id is not distinct from k.cc
                and not exists (select 1 from invoices i2 where i2.purchase_request_id = p.id and i2.deleted_at is null and i2.status <> 'Cancelada')), 0),
    coalesce((select sum(e.total) from expenses e
              where extract(year from e.expense_date) = _year and e.deleted_at is null
                and lower(e.budget_category) = lower(k.cat) and e.cost_center_id is not distinct from k.cc), 0)
  from keys k
  order by 1, 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aprovações de quem só tem "Ver + Aprovar" (Diretoria): nota fiscal e orçamento
-- -----------------------------------------------------------------------------
create or replace function public.decide_invoice(_id uuid, _approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.has_perm('fin_orcamento', 'approve') then
    raise exception 'Seu cargo não aprova notas fiscais.' using errcode = '42501';
  end if;
  update invoices set status = case when _approve then 'Aprovada' else 'Pendente' end
   where id = _id and deleted_at is null and status = case when _approve then 'Pendente' else 'Aprovada' end;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception '%', case when _approve then 'Só notas pendentes podem ser aprovadas.' else 'Só notas aprovadas (não pagas) podem ser reabertas.' end;
  end if;
end;
$$;

create or replace function public.approve_budget_line(_id uuid, _amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not public.has_perm('fin_orcamento', 'approve') then
    raise exception 'Seu cargo não aprova orçamento.' using errcode = '42501';
  end if;
  if _amount is null or _amount < 0 then raise exception 'Valor inválido.'; end if;
  update budget_lines set approved = _amount where id = _id and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Linha de orçamento não encontrada.'; end if;
end;
$$;

alter publication supabase_realtime add table
  public.cost_centers, public.budget_lines, public.purchase_requests, public.purchase_approvals,
  public.invoices, public.payments, public.expenses;

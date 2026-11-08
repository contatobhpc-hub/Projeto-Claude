-- =============================================================================
-- Marketing Hub 2.0 — Fase 5: Inteligência
-- Notificações automáticas, Planejamento Estratégico (objetivos e resultados-
-- chave), Indicadores, Workflows (automações), Central IA e importação de dados.
-- =============================================================================

-- =============================================================================
-- 1. NOTIFICAÇÕES
-- =============================================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'info',     -- info | approval | deadline | assignment | alert
  title       text not null,
  body        text not null default '',
  link        text not null default '',
  module      text references public.modules(key),
  record_id   uuid,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create unique index notifications_dedupe_idx on public.notifications(user_id, dedupe_key) where dedupe_key is not null;

alter table public.notifications enable row level security;
create policy notifications_own_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
-- Sem política de insert: só as funções abaixo criam notificações.

-- Uma notificação para uma pessoa (ignora quem está inativo e o próprio autor da ação)
create or replace function public.notify_user(
  _user uuid, _kind text, _title text, _body text, _link text, _module text, _record uuid, _dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if _user is null then return; end if;
  -- Quem fez a ação não é avisado dela (exceto na varredura diária de prazos)
  if _user = auth.uid() and coalesce(current_setting('mhub.notify_self', true), '') <> '1' then return; end if;
  if not exists (select 1 from profiles where id = _user and active) then return; end if;
  insert into notifications (user_id, kind, title, body, link, module, record_id, dedupe_key)
  values (_user, _kind, _title, coalesce(_body, ''), coalesce(_link, ''), _module, _record, _dedupe)
  on conflict do nothing;
end;
$$;

-- Pessoas ativas com uma permissão (ex.: todos que aprovam compras)
create or replace function public.users_with_perm(_module text, _action text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from profiles p join roles r on r.id = p.role_id
  left join role_permissions rp on rp.role_id = p.role_id and rp.module = _module
  where p.active and (
    r.key = 'admin' or case _action
      when 'view' then rp.can_view when 'create' then rp.can_create when 'edit' then rp.can_edit
      when 'delete' then rp.can_delete when 'approve' then rp.can_approve else false end
  );
$$;

create or replace function public.notify_perm(
  _module text, _action text, _kind text, _title text, _body text, _link text, _record uuid, _exclude uuid default null, _dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select * from users_with_perm(_module, _action) loop
    if u is distinct from _exclude then
      perform notify_user(u, _kind, _title, _body, _link, _module, _record, _dedupe);
    end if;
  end loop;
end;
$$;

create or replace function public.notify_role(
  _roles text[], _kind text, _title text, _body text, _link text, _module text, _record uuid, _exclude uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select p.id from profiles p join roles r on r.id = p.role_id where p.active and r.key = any(_roles) loop
    if u is distinct from _exclude then
      perform notify_user(u, _kind, _title, _body, _link, _module, _record, null);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- Gatilhos de notificação

-- Tarefa atribuída
create or replace function public.notify_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform notify_user(new.assignee_id, 'assignment', 'Nova tarefa para você: ' || new.title,
      coalesce('Prazo: ' || to_char(new.due_date, 'DD/MM/YYYY'), 'Sem prazo definido'), '/kanban', 'kanban', new.id, null);
  end if;
  return new;
end;
$$;
create trigger tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assignment();

-- Pedido e decisão de aprovação (campanhas, projetos, contratos)
create or replace function public.notify_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mod text;
  label text;
  title text;
  link text;
  creator uuid;
begin
  select module into mod from module_tables where table_name = tg_table_name;
  title := coalesce(to_jsonb(new)->>'name', to_jsonb(new)->>'object', 'registro');
  label := case tg_table_name when 'campaigns' then 'Campanha' when 'projects' then 'Projeto' when 'contracts' then 'Contrato' else 'Item' end;
  link := case tg_table_name when 'campaigns' then '/campanhas/' when 'projects' then '/projetos/' when 'contracts' then '/contratos/' else '/' end || new.id;
  creator := (to_jsonb(new)->>'created_by')::uuid;
  if new.approval_status is distinct from old.approval_status then
    if new.approval_status = 'Aguardando' then
      perform notify_perm(mod, 'approve', 'approval', label || ' aguardando sua aprovação: ' || title, '', link, new.id, auth.uid(), null);
    elsif new.approval_status in ('Aprovada', 'Reprovada') then
      perform notify_user(creator, 'approval', label || ' ' || lower(new.approval_status) || ': ' || title,
        coalesce(nullif(new.approval_note, ''), ''), link, mod, new.id, null);
    end if;
  end if;
  return new;
end;
$$;
create trigger campaigns_notify_approval after update of approval_status on public.campaigns for each row execute function public.notify_approval();
create trigger projects_notify_approval after update of approval_status on public.projects for each row execute function public.notify_approval();
create trigger contracts_notify_approval after update of approval_status on public.contracts for each row execute function public.notify_approval();

-- Conteúdo: pedido de aprovação e decisão
create or replace function public.notify_content()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'Aguardando aprovação' then
      perform notify_perm('conteudos', 'approve', 'approval', 'Conteúdo aguardando aprovação: ' || new.title, '', '/conteudos?id=' || new.id, new.id, auth.uid(), null);
    elsif new.status = 'Aprovado' then
      perform notify_user(new.created_by, 'approval', 'Conteúdo aprovado: ' || new.title, new.review_note, '/conteudos?id=' || new.id, 'conteudos', new.id, null);
    elsif new.status = 'Em revisão' and old.status = 'Aguardando aprovação' then
      perform notify_user(new.created_by, 'approval', 'Conteúdo devolvido para ajustes: ' || new.title, new.review_note, '/conteudos?id=' || new.id, 'conteudos', new.id, null);
    end if;
  end if;
  return new;
end;
$$;
create trigger content_notify after update of status on public.content_items for each row execute function public.notify_content();

-- Compras: envio, alçada e decisão
create or replace function public.notify_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  link text := '/compras?id=' || new.id;
  label text := new.code || ' · ' || new.description;
begin
  if tg_op = 'INSERT' and new.status = 'Solicitado' or tg_op = 'UPDATE' and new.status = 'Solicitado' and old.status is distinct from 'Solicitado' then
    perform notify_perm('fin_compras', 'approve', 'approval', 'Compra para aprovar: ' || label,
      'Valor estimado R$ ' || to_char(new.estimated_value, 'FM999G999G990D00'), link, new.id, new.requester_id, null);
  elsif tg_op = 'UPDATE' and new.status = 'Em aprovação' and old.status <> 'Em aprovação' then
    perform notify_role(array['diretoria', 'admin'], 'approval', 'Compra acima da alçada aguardando Diretoria: ' || label, '', link, 'fin_compras', new.id, new.requester_id);
  elsif tg_op = 'UPDATE' and new.status in ('Aprovado', 'Recusado') and old.status is distinct from new.status then
    perform notify_user(new.requester_id, 'approval', 'Sua compra foi ' || case new.status when 'Aprovado' then 'aprovada' else 'recusada' end || ': ' || label, new.decision_note, link, 'fin_compras', new.id, null);
  end if;
  return new;
end;
$$;
create trigger purchase_notify after insert or update of status on public.purchase_requests for each row execute function public.notify_purchase();

-- Nota fiscal lançada → aprovadores do Financeiro
create or replace function public.notify_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_perm('fin_orcamento', 'approve', 'approval', 'Nota fiscal para aprovar: NF ' || new.number,
    'R$ ' || to_char(new.value, 'FM999G999G990D00'), '/financeiro?tab=notas', new.id, auth.uid(), null);
  return new;
end;
$$;
create trigger invoice_notify after insert on public.invoices for each row execute function public.notify_invoice();

-- Novo cadastro → Administradores
create or replace function public.notify_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.active then
    perform notify_role(array['admin'], 'alert', 'Novo cadastro aguardando liberação: ' || coalesce(nullif(new.full_name, ''), new.email),
      new.email, '/admin/usuarios', 'admin', new.id, null);
  end if;
  return new;
end;
$$;
create trigger profiles_notify_signup after insert on public.profiles for each row execute function public.notify_signup();

-- ---------------------------------------------------------------- Varredura diária de prazos
-- Pode ser chamada por agendamento (pg_cron) e também pelo app ao abrir (é idempotente).
create or replace function public.generate_due_notifications()
returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
  before int;
  after int;
begin
  if auth.uid() is not null and not public.is_active_user() then return 0; end if;
  select count(*) into before from notifications;
  perform set_config('mhub.notify_self', '1', true);

  -- Tarefas vencendo amanhã ou atrasadas (uma vez por dia)
  for r in select id, title, assignee_id, due_date from tasks
           where deleted_at is null and assignee_id is not null and status not in ('Concluído', 'Cancelado')
             and due_date <= today + 1 loop
    perform notify_user(r.assignee_id, 'deadline',
      case when r.due_date < today then 'Tarefa atrasada: ' when r.due_date = today then 'Tarefa vence hoje: ' else 'Tarefa vence amanhã: ' end || r.title,
      'Prazo: ' || to_char(r.due_date, 'DD/MM/YYYY'), '/kanban', 'kanban', r.id, 'task-due:' || r.id || ':' || today);
  end loop;

  -- Contratos a 30, 7 e 1 dia do vencimento, e vencidos (responsável ou quem edita contratos)
  for r in select id, object, owner_id, end_date, end_date - today as d from contracts
           where deleted_at is null and status not in ('Encerrado', 'Cancelado') and end_date is not null
             and (end_date - today in (30, 7, 1, 0) or end_date = today - 1) loop
    if r.owner_id is not null then
      perform notify_user(r.owner_id, 'deadline', case when r.d < 0 then 'Contrato venceu: ' when r.d = 0 then 'Contrato vence hoje: ' else 'Contrato vence em ' || r.d || ' dia(s): ' end || r.object,
        'Vencimento: ' || to_char(r.end_date, 'DD/MM/YYYY'), '/contratos/' || r.id, 'contratos', r.id, 'contract:' || r.id || ':' || r.d);
    else
      perform notify_perm('contratos', 'edit', 'deadline', case when r.d < 0 then 'Contrato venceu: ' when r.d = 0 then 'Contrato vence hoje: ' else 'Contrato vence em ' || r.d || ' dia(s): ' end || r.object,
        'Vencimento: ' || to_char(r.end_date, 'DD/MM/YYYY'), '/contratos/' || r.id, r.id, null, 'contract:' || r.id || ':' || r.d);
    end if;
  end loop;

  -- Pagamentos vencendo em até 3 dias ou atrasados (quem registra pagamentos)
  for r in select id, description, value, due_date from payments
           where deleted_at is null and status = 'Agendado' and due_date <= today + 3 loop
    perform notify_perm('fin_orcamento', 'edit', 'deadline',
      case when r.due_date < today then 'Pagamento atrasado: ' else 'Pagamento vence ' || to_char(r.due_date, 'DD/MM') || ': ' end || r.description,
      'R$ ' || to_char(r.value, 'FM999G999G990D00'), '/financeiro?tab=pagamentos', r.id, null, 'payment:' || r.id || ':' || today);
  end loop;

  -- Mídia para retirar em até 2 dias
  for r in select id, title, owner_id, removal_date from offline_media
           where deleted_at is null and status not in ('Retirado', 'Cancelado') and removal_date is not null and removal_date <= today + 2 loop
    perform notify_user(r.owner_id, 'deadline', 'Retirar mídia: ' || r.title, 'Retirada: ' || to_char(r.removal_date, 'DD/MM/YYYY'),
      '/midia-offline?id=' || r.id, 'midia', r.id, 'media:' || r.id || ':' || today);
  end loop;

  -- Brindes com estoque baixo (uma vez por semana)
  for r in select id, name, quantity - reserved as avail, min_quantity from inventory_items
           where deleted_at is null and quantity - reserved <= min_quantity loop
    perform notify_perm('brindes', 'edit', 'alert', 'Estoque baixo: ' || r.name, r.avail || ' disponível(is), mínimo ' || r.min_quantity,
      '/brindes', r.id, null, 'stock:' || r.id || ':' || to_char(today, 'IYYY-IW'));
  end loop;

  -- Eventos daqui a 3 dias (responsável)
  for r in select id, name, assignee_id, event_date from events
           where deleted_at is null and status not in ('Concluído', 'Cancelado') and event_date = today + 3 loop
    perform notify_user(r.assignee_id, 'deadline', 'Evento em 3 dias: ' || r.name, 'Confira checklist e convidados.',
      '/eventos/' || r.id, 'eventos', r.id, 'event:' || r.id || ':' || today);
  end loop;

  perform set_config('mhub.notify_self', '', true);
  select count(*) into after from notifications;
  return after - before;
end;
$$;

-- Agenda diária às 7h (horário de Brasília = 10h UTC), quando o pg_cron estiver disponível
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('mhub-alertas-diarios', '0 10 * * *', 'select public.generate_due_notifications()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível; os alertas diários serão gerados quando alguém abrir o app.';
end $$;

-- =============================================================================
-- 2. PLANEJAMENTO ESTRATÉGICO
-- =============================================================================
create table public.strategic_objectives (
  id              uuid primary key default gen_random_uuid(),
  year            int not null check (year between 2000 and 2100),
  title           text not null check (length(trim(title)) > 0),
  description     text not null default '',
  perspective     text not null default 'Negócios' check (perspective in ('Negócios','Marca','Relacionamento','Pessoas e processos')),
  status          text not null default 'Planejado' check (status in ('Planejado','Em andamento','Concluído','Cancelado')),
  owner_id        uuid references public.profiles(id) on delete set null,
  approval_status text not null default 'Não solicitada' check (approval_status in ('Não solicitada','Aguardando','Aprovada','Reprovada')),
  approval_note   text not null default '',
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index strategic_objectives_year_idx on public.strategic_objectives(year) where deleted_at is null;

-- =============================================================================
-- 3. INDICADORES
-- =============================================================================
create table public.indicators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text not null default '',
  unit        text not null default '',
  direction   text not null default 'up' check (direction in ('up', 'down')),   -- maior é melhor / menor é melhor
  frequency   text not null default 'Mensal' check (frequency in ('Mensal', 'Trimestral', 'Anual')),
  target      numeric(16,2),
  owner_id    uuid references public.profiles(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.indicator_values (
  id           uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.indicators(id) on delete cascade,
  period       date not null,   -- primeiro dia do mês/trimestre/ano
  value        numeric(16,2) not null,
  note         text not null default '',
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (indicator_id, period)
);
alter table public.indicator_values enable row level security;
create policy indicator_values_select on public.indicator_values for select to authenticated using (public.has_perm('indicadores', 'view'));
create policy indicator_values_write on public.indicator_values for all to authenticated
  using (public.has_perm('indicadores', 'edit') or public.has_perm('indicadores', 'create'))
  with check (public.has_perm('indicadores', 'edit') or public.has_perm('indicadores', 'create'));
create trigger audit_indicator_values after insert or update or delete on public.indicator_values for each row execute function public.audit_row();

-- Resultados-chave do objetivo (podem acompanhar um indicador)
create table public.key_results (
  id           uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.strategic_objectives(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  unit         text not null default '',
  baseline     numeric(16,2) not null default 0,
  target       numeric(16,2) not null,
  current      numeric(16,2) not null default 0,
  indicator_id uuid references public.indicators(id) on delete set null,
  owner_id     uuid references public.profiles(id) on delete set null,
  due_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index key_results_obj_idx on public.key_results(objective_id);
alter table public.key_results enable row level security;
create policy key_results_select on public.key_results for select to authenticated using (public.has_perm('planejamento', 'view'));
create policy key_results_write on public.key_results for all to authenticated
  using (public.has_perm('planejamento', 'edit') or public.has_perm('planejamento', 'create'))
  with check (public.has_perm('planejamento', 'edit') or public.has_perm('planejamento', 'create'));
create trigger audit_key_results after insert or update or delete on public.key_results for each row execute function public.audit_row();

-- Campanhas ligadas a um objetivo estratégico
alter table public.campaigns add column objective_id uuid references public.strategic_objectives(id) on delete set null;
create index campaigns_objective_idx on public.campaigns(objective_id);

select public.register_module_table('public.strategic_objectives', 'planejamento', 'title');
select public.register_module_table('public.indicators', 'indicadores', 'name');
create trigger objectives_approval before insert or update on public.strategic_objectives for each row execute function public.guard_approval();

create or replace function public.notify_objective_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status is distinct from old.approval_status then
    if new.approval_status = 'Aguardando' then
      perform notify_perm('planejamento', 'approve', 'approval', 'Objetivo estratégico aguardando aprovação: ' || new.title, '', '/planejamento', new.id, auth.uid(), null);
    elsif new.approval_status in ('Aprovada', 'Reprovada') then
      perform notify_user(new.created_by, 'approval', 'Objetivo ' || lower(new.approval_status) || ': ' || new.title, new.approval_note, '/planejamento', 'planejamento', new.id, null);
    end if;
  end if;
  return new;
end;
$$;
create trigger objectives_notify_approval after update of approval_status on public.strategic_objectives for each row execute function public.notify_objective_approval();

-- =============================================================================
-- 4. WORKFLOWS (automações executadas no servidor)
-- =============================================================================
create table public.workflow_rules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  description     text not null default '',
  active          boolean not null default true,
  trigger         text not null check (trigger in (
                    'campaign_created', 'campaign_status', 'project_created', 'event_created', 'task_done',
                    'content_approved', 'purchase_approved', 'partner_created', 'sponsorship_created', 'contract_created')),
  condition_field text not null default '',   -- ex.: status, type, category
  condition_value text not null default '',
  actions         jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
select public.register_module_table('public.workflow_rules', 'workflows', 'name');

create table public.workflow_runs (
  id         bigint generated always as identity primary key,
  rule_id    uuid references public.workflow_rules(id) on delete cascade,
  trigger    text not null,
  record_id  uuid,
  status     text not null check (status in ('ok', 'erro')),
  log        text not null default '',
  created_at timestamptz not null default now()
);
create index workflow_runs_rule_idx on public.workflow_runs(rule_id, created_at desc);
alter table public.workflow_runs enable row level security;
create policy workflow_runs_select on public.workflow_runs for select to authenticated using (public.has_perm('workflows', 'view'));

-- Executa as regras ativas de um gatilho. Ações:
--   {"type":"create_task","title":"Arte de {nome}","assignee_id":"<uuid>|owner","due_in_days":5,"priority":"Alta"}
--   {"type":"notify","target":"owner"|"role:gestor"|"user:<uuid>","message":"Texto com {nome}"}
--   {"type":"add_checklist","items":["Briefing","Arte","Aprovação"]}
-- Erros numa ação ficam no log e não impedem a operação de quem disparou.
create or replace function public.run_workflows(_trigger text, _module text, _row jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  rule workflow_rules%rowtype;
  act jsonb;
  nome text := coalesce(_row->>'name', _row->>'title', _row->>'company', _row->>'event_name', _row->>'object', _row->>'description', '');
  rid uuid := (_row->>'id')::uuid;
  owner uuid := coalesce((_row->>'owner_id')::uuid, (_row->>'assignee_id')::uuid, (_row->>'requester_id')::uuid, (_row->>'created_by')::uuid);
  logtxt text;
  ok boolean;
  target uuid;
  item text;
begin
  if coalesce(current_setting('mhub.wf_depth', true), '') = '1' or coalesce(current_setting('mhub.import', true), '') = '1' then
    return;  -- evita automações em cascata e durante importação
  end if;
  perform set_config('mhub.wf_depth', '1', true);
  for rule in select * from workflow_rules where active and deleted_at is null and trigger = _trigger loop
    if rule.condition_field <> '' and coalesce(_row->>rule.condition_field, '') <> rule.condition_value then
      continue;
    end if;
    logtxt := ''; ok := true;
    for act in select * from jsonb_array_elements(rule.actions) loop
      begin
        case act->>'type'
          when 'create_task' then
            target := case when act->>'assignee_id' = 'owner' then owner else nullif(act->>'assignee_id', '')::uuid end;
            insert into tasks (title, assignee_id, due_date, priority, status,
                               campaign_id, project_id, event_id)
            values (replace(coalesce(act->>'title', 'Tarefa'), '{nome}', nome), target,
                    case when act ? 'due_in_days' then current_date + (act->>'due_in_days')::int end,
                    coalesce(act->>'priority', 'Média'), 'Backlog',
                    case when _module = 'campanhas' then rid else (_row->>'campaign_id')::uuid end,
                    case when _module = 'projetos' then rid else (_row->>'project_id')::uuid end,
                    case when _module = 'eventos' then rid else (_row->>'event_id')::uuid end);
            logtxt := logtxt || 'Tarefa criada. ';
          when 'notify' then
            if act->>'target' = 'owner' then
              perform notify_user(owner, 'info', replace(coalesce(act->>'message', rule.name), '{nome}', nome), rule.name, '', _module, rid, null);
            elsif act->>'target' like 'role:%' then
              perform notify_role(array[substr(act->>'target', 6)], 'info', replace(coalesce(act->>'message', rule.name), '{nome}', nome), rule.name, '', _module, rid, null);
            elsif act->>'target' like 'user:%' then
              perform notify_user(substr(act->>'target', 6)::uuid, 'info', replace(coalesce(act->>'message', rule.name), '{nome}', nome), rule.name, '', _module, rid, null);
            end if;
            logtxt := logtxt || 'Notificação enviada. ';
          when 'add_checklist' then
            for item in select * from jsonb_array_elements_text(coalesce(act->'items', '[]'::jsonb)) loop
              insert into checklist_items (module, record_id, text) values (_module, rid, replace(item, '{nome}', nome));
            end loop;
            logtxt := logtxt || 'Checklist adicionado. ';
          else
            logtxt := logtxt || 'Ação desconhecida: ' || coalesce(act->>'type', '?') || '. ';
        end case;
      exception when others then
        ok := false;
        logtxt := logtxt || 'Erro em ' || coalesce(act->>'type', '?') || ': ' || sqlerrm || '. ';
      end;
    end loop;
    insert into workflow_runs (rule_id, trigger, record_id, status, log) values (rule.id, _trigger, rid, case when ok then 'ok' else 'erro' end, trim(logtxt));
  end loop;
  perform set_config('mhub.wf_depth', '', true);
end;
$$;

create or replace function public.workflow_dispatch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  trig text;
  mod text;
begin
  select module into mod from module_tables where table_name = tg_table_name;
  if tg_op = 'INSERT' then
    trig := case tg_table_name
      when 'campaigns' then 'campaign_created' when 'projects' then 'project_created' when 'events' then 'event_created'
      when 'partners' then 'partner_created' when 'sponsorships' then 'sponsorship_created' when 'contracts' then 'contract_created' end;
  else
    if tg_table_name = 'campaigns' and new.status is distinct from old.status then trig := 'campaign_status';
    elsif tg_table_name = 'tasks' and new.status = 'Concluído' and old.status is distinct from 'Concluído' then trig := 'task_done';
    elsif tg_table_name = 'content_items' and new.status = 'Aprovado' and old.status is distinct from 'Aprovado' then trig := 'content_approved';
    elsif tg_table_name = 'purchase_requests' and new.status = 'Aprovado' and old.status is distinct from 'Aprovado' then trig := 'purchase_approved';
    end if;
  end if;
  if trig is not null then
    perform run_workflows(trig, mod, to_jsonb(new));
  end if;
  return new;
end;
$$;

create trigger wf_campaigns after insert or update of status on public.campaigns for each row execute function public.workflow_dispatch();
create trigger wf_projects after insert on public.projects for each row execute function public.workflow_dispatch();
create trigger wf_events after insert on public.events for each row execute function public.workflow_dispatch();
create trigger wf_partners after insert on public.partners for each row execute function public.workflow_dispatch();
create trigger wf_sponsorships after insert on public.sponsorships for each row execute function public.workflow_dispatch();
create trigger wf_contracts after insert on public.contracts for each row execute function public.workflow_dispatch();
create trigger wf_tasks after update of status on public.tasks for each row execute function public.workflow_dispatch();
create trigger wf_content after update of status on public.content_items for each row execute function public.workflow_dispatch();
create trigger wf_purchases after update of status on public.purchase_requests for each row execute function public.workflow_dispatch();

-- =============================================================================
-- 5. CENTRAL IA (conversas privadas de cada pessoa + biblioteca de prompts da equipe)
-- A chamada ao modelo é feita pela Edge Function "ai-chat" (chave fica só no servidor).
-- =============================================================================
insert into public.app_settings (key, value) values
  ('ai', jsonb_build_object(
    'model', 'claude-sonnet-5-5',
    'monthly_message_limit', 300,
    'org_context', 'Você apoia a equipe de Marketing do Sicoob Credibelo, cooperativa de crédito com atuação em Campo Belo, Candeias, Cristais, Aguanil, Cana Verde e Santana do Jacaré (MG). Use português do Brasil, tom próximo e cooperativista, sem prometer taxas ou condições que não foram informadas.'
  ))
on conflict (key) do nothing;

create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title       text not null default 'Nova conversa',
  campaign_id uuid references public.campaigns(id) on delete set null,
  project_id  uuid references public.projects(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations(user_id, updated_at desc);
alter table public.ai_conversations enable row level security;
create policy ai_conv_own on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and public.has_perm('ia', 'view'))
  with check (user_id = auth.uid() and public.has_perm('ia', 'create'));

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  tokens_in       int,
  tokens_out      int,
  created_at      timestamptz not null default now()
);
create index ai_messages_conv_idx on public.ai_messages(conversation_id, created_at);
alter table public.ai_messages enable row level security;
create policy ai_msg_select on public.ai_messages for select to authenticated
  using (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
-- Pessoas só gravam as próprias perguntas; as respostas são gravadas pela Edge Function (chave de serviço).
create policy ai_msg_insert on public.ai_messages for insert to authenticated
  with check (role = 'user' and exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create table public.ai_prompts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  category    text not null default 'Conteúdo',
  prompt      text not null check (length(trim(prompt)) > 0),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.ai_prompts enable row level security;
create policy ai_prompts_select on public.ai_prompts for select to authenticated using (public.has_perm('ia', 'view'));
create policy ai_prompts_insert on public.ai_prompts for insert to authenticated with check (public.has_perm('ia', 'create') and created_by = auth.uid());
create policy ai_prompts_change on public.ai_prompts for update to authenticated using (created_by = auth.uid() or public.has_perm('ia', 'delete'));
create policy ai_prompts_delete on public.ai_prompts for delete to authenticated using (created_by = auth.uid() or public.has_perm('ia', 'delete'));

-- Quantas perguntas a pessoa já fez no mês (para o limite de uso)
create or replace function public.ai_usage_this_month(_user uuid default auth.uid())
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from ai_messages m join ai_conversations c on c.id = m.conversation_id
  where c.user_id = _user and m.role = 'user' and m.created_at >= date_trunc('month', now());
$$;

-- =============================================================================
-- 6. IMPORTAÇÃO DO APP ANTIGO (somente Administrador)
-- Recebe linhas já convertidas pela tela de importação e grava com as regras
-- de fluxo desligadas (status, valores e datas originais são preservados).
-- =============================================================================
create or replace function public.import_rows(_table text, _rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  cols text;
  n int;
begin
  if not public.is_admin() then raise exception 'Apenas Administradores importam dados.' using errcode = '42501'; end if;
  if _table not in ('partners', 'campaigns', 'projects', 'tasks', 'calendar_events', 'content_items', 'contracts', 'events',
                    'event_schedule', 'event_attendees', 'event_suppliers', 'sponsorships', 'offline_media', 'inventory_items',
                    'cost_centers', 'budget_lines', 'expenses', 'purchase_requests', 'invoices', 'payments', 'checklist_items',
                    'comments', 'strategic_objectives', 'key_results') then
    raise exception 'Tabela não permitida na importação: %', _table;
  end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) = 0 then return 0; end if;

  -- Só colunas que existem e não são calculadas
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = _table and c.is_generated = 'NEVER'
    and exists (select 1 from jsonb_array_elements(_rows) r where r ? c.column_name);

  perform set_config('mhub.import', '1', true);
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                 _table, cols, cols, _table) using _rows;
  get diagnostics n = row_count;
  perform set_config('mhub.import', '', true);
  return n;
end;
$$;

-- Durante a importação, os gatilhos de fluxo respeitam os valores originais
create or replace function public.is_importing() returns boolean language sql stable as $$
  select coalesce(current_setting('mhub.import', true), '') = '1';
$$;

create or replace function public.stamp_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mod text;
  has_assignee boolean;
begin
  if public.is_importing() then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.deleted_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.deleted_at is distinct from old.deleted_at and auth.uid() is not null then
      select module into mod from module_tables where table_name = tg_table_name;
      has_assignee := (to_jsonb(old) ? 'assignee_id');
      if not (public.has_perm(mod, 'delete')
              or (has_assignee and (to_jsonb(old)->>'assignee_id')::uuid = auth.uid()
                  and public.has_own_perm(mod, 'delete'))) then
        raise exception 'Sem permissão para excluir neste módulo.' using errcode = '42501';
      end if;
      if new.deleted_at is not null then
        new.deleted_at := now();
      end if;
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.purchase_request_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_importing() then
    new.code := coalesce(nullif(new.code, ''), 'PC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.purchase_request_seq')::text, 4, '0'));
    return new;
  end if;
  new.code := 'PC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.purchase_request_seq')::text, 4, '0');
  if auth.uid() is not null then new.requester_id := auth.uid(); end if;
  if new.status not in ('Rascunho', 'Solicitado') then new.status := 'Rascunho'; end if;
  if new.status = 'Solicitado' then new.submitted_at := now(); end if;
  return new;
end;
$$;

create or replace function public.invoice_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_importing() then return new; end if;
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

-- Pagamento importado não gera despesa automática (as despesas antigas vêm à parte)
create or replace function public.payment_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv invoices%rowtype;
begin
  if public.is_importing() then return new; end if;
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

-- Saldo de brindes importado é aceito como está
create or replace function public.guard_inventory_balance()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_importing() then return new; end if;
  if coalesce(current_setting('mhub.stock_tx', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.quantity := 0; new.reserved := 0;
    else
      new.quantity := old.quantity; new.reserved := old.reserved;
    end if;
  end if;
  return new;
end;
$$;

-- Notificações e alertas de tarefa não são disparados durante a importação
create or replace function public.notify_task_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_importing() then return new; end if;
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform notify_user(new.assignee_id, 'assignment', 'Nova tarefa para você: ' || new.title,
      coalesce('Prazo: ' || to_char(new.due_date, 'DD/MM/YYYY'), 'Sem prazo definido'), '/kanban', 'kanban', new.id, null);
  end if;
  return new;
end;
$$;

create or replace function public.notify_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_importing() then return new; end if;
  perform notify_perm('fin_orcamento', 'approve', 'approval', 'Nota fiscal para aprovar: NF ' || new.number,
    'R$ ' || to_char(new.value, 'FM999G999G990D00'), '/financeiro?tab=notas', new.id, auth.uid(), null);
  return new;
end;
$$;

create or replace function public.notify_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  link text := '/compras?id=' || new.id;
  label text := new.code || ' · ' || new.description;
begin
  if public.is_importing() then return new; end if;
  if tg_op = 'INSERT' and new.status = 'Solicitado' or tg_op = 'UPDATE' and new.status = 'Solicitado' and old.status is distinct from 'Solicitado' then
    perform notify_perm('fin_compras', 'approve', 'approval', 'Compra para aprovar: ' || label,
      'Valor estimado R$ ' || to_char(new.estimated_value, 'FM999G999G990D00'), link, new.id, new.requester_id, null);
  elsif tg_op = 'UPDATE' and new.status = 'Em aprovação' and old.status <> 'Em aprovação' then
    perform notify_role(array['diretoria', 'admin'], 'approval', 'Compra acima da alçada aguardando Diretoria: ' || label, '', link, 'fin_compras', new.id, new.requester_id);
  elsif tg_op = 'UPDATE' and new.status in ('Aprovado', 'Recusado') and old.status is distinct from new.status then
    perform notify_user(new.requester_id, 'approval', 'Sua compra foi ' || case new.status when 'Aprovado' then 'aprovada' else 'recusada' end || ': ' || label, new.decision_note, link, 'fin_compras', new.id, null);
  end if;
  return new;
end;
$$;

-- Tempo real
alter publication supabase_realtime add table
  public.notifications, public.strategic_objectives, public.key_results, public.indicators, public.indicator_values,
  public.workflow_rules, public.workflow_runs, public.ai_conversations, public.ai_messages, public.ai_prompts;

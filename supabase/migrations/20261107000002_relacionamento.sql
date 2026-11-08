-- =============================================================================
-- Marketing Hub 2.0 — Fase 3: Relacionamento e materiais
-- Parceiros, Contratos, Eventos, Patrocínios, Mídia Offline e Brindes (estoque).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Listas configuráveis pelo Administrador (categorias que antes ficavam no navegador)
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('lists', jsonb_build_object(
    'partner_categories',  jsonb_build_array('Agência','Fornecedor','Patrocinador','Mídia','Rádio','Gráfica','Brindes','Eventos','Tecnologia','Consultoria'),
    'contract_categories', jsonb_build_array('Agência','Mídia','Patrocínio','Fornecedor','Gráfica','Tecnologia','Eventos','Consultoria','Outros'),
    'media_categories',    jsonb_build_array('Outdoor','Painel LED','TV','Faixa','Banner','Cartaz','Folder','Busdoor','Backdrop','Relógio Digital')
  )),
  ('sponsorship_budget', jsonb_build_object('2026', 250000))
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Parceiros
-- -----------------------------------------------------------------------------
create table public.partners (
  id               uuid primary key default gen_random_uuid(),
  company          text not null check (length(trim(company)) > 0),
  category         text not null default 'Fornecedor',
  status           text not null default 'Prospect'
                   check (status in ('Prospect','Negociação','Ativo','Renovação','Inativo')),
  city             text not null default '',
  contact_name     text not null default '',
  phone            text not null default '',
  whatsapp         text not null default '',
  email            text not null default '',
  document         text not null default '',   -- CNPJ/CPF
  owner_id         uuid references public.profiles(id) on delete set null,
  counterparts     text not null default '',
  investment_month numeric(14,2) not null default 0 check (investment_month >= 0),
  expected_return  numeric(14,2) not null default 0 check (expected_return >= 0),
  delivered_return numeric(14,2) not null default 0 check (delivered_return >= 0),
  notes            text not null default '',
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index partners_status_idx on public.partners(status) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Contratos (com aprovação da Diretoria)
-- -----------------------------------------------------------------------------
create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  object          text not null check (length(trim(object)) > 0),   -- objeto do contrato
  partner_id      uuid references public.partners(id) on delete set null,
  company         text not null default '',   -- contratado, quando não é parceiro cadastrado
  category        text not null default 'Outros',
  status          text not null default 'Rascunho'
                  check (status in ('Rascunho','Em análise','Assinado','Vigente','Renovação','Encerrado','Cancelado')),
  value           numeric(14,2) not null default 0 check (value >= 0),
  cost_center     text not null default '',
  start_date      date,
  end_date        date,
  renewal_date    date,
  auto_renewal    boolean not null default false,
  owner_id        uuid references public.profiles(id) on delete set null,
  campaign_id     uuid references public.campaigns(id) on delete set null,
  notes           text not null default '',
  approval_status text not null default 'Não solicitada'
                  check (approval_status in ('Não solicitada','Aguardando','Aprovada','Reprovada')),
  approval_note   text not null default '',
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index contracts_partner_idx on public.contracts(partner_id);
create index contracts_end_idx on public.contracts(end_date) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Eventos (ações e eventos de marketing; compromissos simples ficam no Calendário)
-- -----------------------------------------------------------------------------
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  type         text not null default 'Ação Externa'
               check (type in ('Lançamento','Assembleia','Feira','Patrocínio','Ação Externa','Treinamento',
                               'Workshop','Confraternização','Inauguração')),
  status       text not null default 'Planejamento'
               check (status in ('Planejamento','Em produção','Confirmado','Em andamento','Concluído','Cancelado')),
  priority     text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
  event_date   date,
  end_date     date,
  start_time   time,
  city         text not null default '',
  venue        text not null default '',
  agency       text not null default '',
  assignee_id  uuid references public.profiles(id) on delete set null,   -- responsável
  team_ids     uuid[] not null default '{}',
  partner_ids  uuid[] not null default '{}',
  campaign_id  uuid references public.campaigns(id) on delete set null,
  objective    text not null default '',
  description  text not null default '',
  budget       numeric(14,2) not null default 0 check (budget >= 0),
  expected_audience int check (expected_audience is null or expected_audience >= 0),
  notes        text not null default '',
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (end_date is null or event_date is null or end_date >= event_date)
);
create index events_date_idx on public.events(event_date) where deleted_at is null;
create index events_campaign_idx on public.events(campaign_id);

-- Tarefas e checklist podem pertencer a um evento
alter table public.tasks add column event_id uuid references public.events(id) on delete set null;
create index tasks_event_idx on public.tasks(event_id);
alter table public.checklist_items add column group_label text not null default '';

-- Cronograma, convidados e fornecedores do evento
create table public.event_schedule (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  starts_at   time,
  title       text not null check (length(trim(title)) > 0),
  owner_id    uuid references public.profiles(id) on delete set null,
  position    double precision not null default extract(epoch from now()),
  created_at  timestamptz not null default now()
);
create index event_schedule_idx on public.event_schedule(event_id, starts_at);

create table public.event_attendees (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  organization text not null default '',
  role         text not null default '',
  email        text not null default '',
  phone        text not null default '',
  confirmed    boolean not null default false,
  checked_in   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index event_attendees_idx on public.event_attendees(event_id);

create table public.event_suppliers (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  partner_id  uuid references public.partners(id) on delete set null,
  name        text not null check (length(trim(name)) > 0),
  service     text not null default '',
  contact     text not null default '',
  value       numeric(14,2) not null default 0 check (value >= 0),
  created_at  timestamptz not null default now()
);
create index event_suppliers_idx on public.event_suppliers(event_id);

-- -----------------------------------------------------------------------------
-- Patrocínios concedidos
-- -----------------------------------------------------------------------------
create table public.sponsorships (
  id                    uuid primary key default gen_random_uuid(),
  event_name            text not null check (length(trim(event_name)) > 0),
  institution           text not null default '',
  city                  text not null default '',
  category              text not null default 'Social'
                        check (category in ('Esportivo','Cultural','Social','Educacional','Agronegócio','Religioso','Empresarial')),
  tier                  text not null default 'Apoio'
                        check (tier in ('Master','Ouro','Prata','Bronze','Apoio','Permuta')),
  status                text not null default 'Em negociação'
                        check (status in ('Em negociação','Confirmado','Em execução','Concluído','Cancelado')),
  value                 numeric(14,2) not null default 0 check (value >= 0),
  start_date            date,
  end_date              date,
  owner_id              uuid references public.profiles(id) on delete set null,
  partner_id            uuid references public.partners(id) on delete set null,
  contract_id           uuid references public.contracts(id) on delete set null,
  event_id              uuid references public.events(id) on delete set null,
  campaign_id           uuid references public.campaigns(id) on delete set null,
  materials_deadline    date,
  counterparts_deadline date,
  accounting_deadline   date,
  report_summary        text not null default '',
  expected_return       numeric(14,2) not null default 0 check (expected_return >= 0),
  delivered_return      numeric(14,2) not null default 0 check (delivered_return >= 0),
  notes                 text not null default '',
  created_by            uuid references auth.users(id) on delete set null,
  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index sponsorships_start_idx on public.sponsorships(start_date) where deleted_at is null;
-- Evita importar a mesma linha da planilha duas vezes
create unique index sponsorships_dedupe_idx on public.sponsorships
  (lower(event_name), lower(institution), coalesce(start_date, '1900-01-01'::date)) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Mídia offline (outdoor, faixas, painéis…)
-- -----------------------------------------------------------------------------
create table public.offline_media (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  categories    text[] not null default '{}',
  status        text not null default 'Planejado'
                check (status in ('Planejado','Arte em produção','Aguardando instalação','Instalado','Retirado','Cancelado')),
  city          text not null default '',
  location      text not null default '',
  supplier      text not null default '',
  partner_id    uuid references public.partners(id) on delete set null,
  campaign_id   uuid references public.campaigns(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  install_date  date,
  removal_date  date,
  owner_id      uuid references public.profiles(id) on delete set null,
  value         numeric(14,2) not null default 0 check (value >= 0),
  cost_center   text not null default '',
  notes         text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (removal_date is null or install_date is null or removal_date >= install_date)
);
create index offline_media_removal_idx on public.offline_media(removal_date) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Brindes: itens + movimentações. O saldo é mantido SÓ pelas movimentações.
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  code          text not null default '',
  name          text not null check (length(trim(name)) > 0),
  category      text not null default 'Outros'
                check (category in ('Vestuário','Papelaria','Tecnologia','Bebidas','Alimentos','Acessórios',
                                    'Decoração','Material gráfico','Kits institucionais','Outros')),
  supplier      text not null default '',
  location      text not null default '',
  unit_value    numeric(14,2) not null default 0 check (unit_value >= 0),
  min_quantity  int not null default 0 check (min_quantity >= 0),
  quantity      int not null default 0 check (quantity >= 0),   -- disponível + reservado
  reserved      int not null default 0 check (reserved >= 0),
  notes         text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (reserved <= quantity)
);
create unique index inventory_code_idx on public.inventory_items(lower(code)) where code <> '' and deleted_at is null;

create table public.inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.inventory_items(id) on delete cascade,
  type         text not null check (type in ('Entrada','Saída','Reserva','Liberação','Inventário')),
  quantity     int not null check (quantity >= 0),   -- em "Inventário" = quantidade contada
  delta        int not null default 0,                -- variação efetiva no estoque (calculada)
  reason       text not null default '',
  destination  text not null default '',
  from_reserve boolean not null default false,        -- saída que consome uma reserva
  campaign_id  uuid references public.campaigns(id) on delete set null,
  event_id     uuid references public.events(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (type = 'Inventário' or quantity > 0)
);
create index inventory_movements_item_idx on public.inventory_movements(item_id, created_at desc);
create index inventory_movements_event_idx on public.inventory_movements(event_id);

-- Aplica a movimentação ao saldo do item (com bloqueio de linha, sem saldo negativo)
create or replace function public.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it inventory_items%rowtype;
  q int;
  r int;
begin
  select * into it from inventory_items where id = new.item_id and deleted_at is null for update;
  if not found then raise exception 'Item de estoque não encontrado.'; end if;
  q := it.quantity; r := it.reserved;

  case new.type
    when 'Entrada' then q := q + new.quantity;
    when 'Saída' then
      if new.from_reserve then
        if new.quantity > r then raise exception 'A saída (%) é maior que o reservado (%).', new.quantity, r using errcode = '23514'; end if;
        r := r - new.quantity;
      elsif new.quantity > q - r then
        raise exception 'Estoque insuficiente: disponível %, pedido %.', q - r, new.quantity using errcode = '23514';
      end if;
      q := q - new.quantity;
    when 'Reserva' then
      if new.quantity > q - r then
        raise exception 'Estoque insuficiente para reservar: disponível %, pedido %.', q - r, new.quantity using errcode = '23514';
      end if;
      r := r + new.quantity;
    when 'Liberação' then
      if new.quantity > r then raise exception 'Só há % reservado(s).', r using errcode = '23514'; end if;
      r := r - new.quantity;
    when 'Inventário' then
      if new.quantity < r then
        raise exception 'A contagem (%) é menor que o reservado (%). Libere reservas antes.', new.quantity, r using errcode = '23514';
      end if;
      q := new.quantity;
  end case;

  new.delta := q - it.quantity;
  perform set_config('mhub.stock_tx', '1', true);
  update inventory_items set quantity = q, reserved = r where id = it.id;
  perform set_config('mhub.stock_tx', '', true);
  return new;
end;
$$;
create trigger inventory_apply before insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

-- Saldo e reservado não podem ser alterados direto pela tela
create or replace function public.guard_inventory_balance()
returns trigger language plpgsql set search_path = public as $$
begin
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
create trigger inventory_guard_balance before insert or update on public.inventory_items
  for each row execute function public.guard_inventory_balance();

alter table public.inventory_movements enable row level security;
create policy inv_mov_select on public.inventory_movements for select to authenticated
  using (public.has_perm('brindes', 'view'));
create policy inv_mov_insert on public.inventory_movements for insert to authenticated
  with check ((public.has_perm('brindes', 'edit') or public.has_perm('brindes', 'create')) and created_by = auth.uid());
-- Movimentações não são editadas nem apagadas: corrige-se com uma nova (Inventário/Entrada).

-- -----------------------------------------------------------------------------
-- Registro no padrão (permissões, lixeira, histórico)
-- -----------------------------------------------------------------------------
select public.register_module_table('public.partners', 'parceiros', 'company');
select public.register_module_table('public.contracts', 'contratos', 'object');
select public.register_module_table('public.events', 'eventos', 'name');
select public.register_module_table('public.sponsorships', 'patrocinios', 'event_name');
select public.register_module_table('public.offline_media', 'midia', 'title');
select public.register_module_table('public.inventory_items', 'brindes', 'name');

create trigger contracts_approval before insert or update on public.contracts
  for each row execute function public.guard_approval();

-- Aprovação passa a valer para qualquer tabela de módulo que tenha o fluxo
create or replace function public.decide_approval(_table text, _id uuid, _decision text, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  mod text;
  n int;
begin
  select module into mod from module_tables where table_name = _table;
  if mod is null or not exists (select 1 from information_schema.columns
                                where table_schema = 'public' and table_name = _table and column_name = 'approval_status') then
    raise exception 'Tabela sem fluxo de aprovação.';
  end if;
  if _decision not in ('Aprovada', 'Reprovada') then raise exception 'Decisão inválida.'; end if;
  if not public.has_perm(mod, 'approve') then
    raise exception 'Seu cargo não pode aprovar neste módulo.' using errcode = '42501';
  end if;
  execute format('update public.%I set approval_status = $1, approval_note = $2
                  where id = $3 and deleted_at is null and approval_status = ''Aguardando''', _table)
    using _decision, coalesce(_note, ''), _id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Este item não está aguardando aprovação.'; end if;
end;
$$;

-- Sub-tabelas do evento: veem quem vê eventos; editam quem edita aquele evento
do $$
declare t text;
begin
  foreach t in array array['event_schedule', 'event_attendees', 'event_suppliers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_perm(''eventos'', ''view''))', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.can_edit_record(''eventos'', event_id))
                    with check (public.can_edit_record(''eventos'', event_id))', t || '_write', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

create trigger audit_inventory_movements after insert on public.inventory_movements
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Tempo real
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.partners, public.contracts, public.events, public.event_schedule, public.event_attendees,
  public.event_suppliers, public.sponsorships, public.offline_media, public.inventory_items,
  public.inventory_movements;

-- =============================================================================
-- Marketing Hub 2.0 — Fase 1: Fundação
-- Cargos, permissões, perfis, histórico de alterações, lixeira, anexos e
-- comentários. Todas as regras de acesso ficam no banco (RLS), não na tela.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Módulos do sistema (catálogo usado pela matriz de permissões e pelo menu)
-- -----------------------------------------------------------------------------
create table public.modules (
  key         text primary key,
  label       text not null,
  group_label text not null,
  sort_order  int  not null default 0
);

insert into public.modules (key, label, group_label, sort_order) values
  ('dashboard',     'Dashboard',                 'Visão Geral',        10),
  ('prioridades',   'Central de Prioridades',    'Visão Geral',        20),
  ('notificacoes',  'Notificações',              'Visão Geral',        30),
  ('planejamento',  'Planejamento Estratégico',  'Estratégia',         40),
  ('indicadores',   'Indicadores',               'Estratégia',         50),
  ('campanhas',     'Campanhas',                 'Operação',           60),
  ('projetos',      'Projetos',                  'Operação',           70),
  ('kanban',        'Kanban',                    'Operação',           80),
  ('calendario',    'Calendário',                'Operação',           90),
  ('conteudos',     'Conteúdos',                 'Operação',          100),
  ('parceiros',     'Parceiros',                 'Relacionamento',    110),
  ('contratos',     'Contratos',                 'Relacionamento',    120),
  ('eventos',       'Eventos',                   'Relacionamento',    130),
  ('patrocinios',   'Patrocínios',               'Relacionamento',    140),
  ('midia',         'Mídia Offline',             'Mídia & Materiais', 150),
  ('brindes',       'Brindes',                   'Mídia & Materiais', 160),
  ('ia',            'Central IA',                'Inteligência',      170),
  ('analytics',     'Analytics',                 'Inteligência',      180),
  ('fin_orcamento', 'Financeiro: orçamento e pagamentos', 'Gestão',   190),
  ('fin_compras',   'Financeiro: solicitações de compra', 'Gestão',   200),
  ('workflows',     'Workflows',                 'Gestão',            210),
  ('admin',         'Usuários, cargos e configurações', 'Gestão',     220);

alter table public.modules enable row level security;
create policy modules_read on public.modules for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- Cargos e matriz de permissões
-- -----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  name        text not null,
  description text not null default '',
  is_system   boolean not null default false,   -- cargos de sistema não podem ser excluídos
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- scope: 'all' = qualquer registro do módulo; 'own' = só registros atribuídos ao usuário
create table public.role_permissions (
  role_id     uuid not null references public.roles(id) on delete cascade,
  module      text not null references public.modules(key) on delete cascade,
  can_view    boolean not null default false,
  can_create  boolean not null default false,
  can_edit    boolean not null default false,
  can_delete  boolean not null default false,
  can_approve boolean not null default false,
  scope       text not null default 'all' check (scope in ('all', 'own')),
  primary key (role_id, module)
);

-- -----------------------------------------------------------------------------
-- Perfis (um por usuário do Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  job_title   text not null default '',
  avatar_url  text,
  role_id     uuid references public.roles(id),
  active      boolean not null default false,  -- novos cadastros aguardam aprovação do Administrador
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role_id);

-- -----------------------------------------------------------------------------
-- Funções de permissão (SECURITY DEFINER para evitar recursão nas políticas)
-- -----------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join roles r on r.id = p.role_id
    where p.id = auth.uid() and p.active and r.key = 'admin'
  );
$$;

-- has_perm: permissão com escopo "todos os registros"
create or replace function public.has_perm(_module text, _action text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role_id = p.role_id and rp.module = _module
    where p.id = auth.uid() and p.active
      and case _action
            when 'view'    then rp.can_view
            when 'create'  then rp.can_create
            when 'edit'    then rp.can_edit and rp.scope = 'all'
            when 'delete'  then rp.can_delete and rp.scope = 'all'
            when 'approve' then rp.can_approve
            else false
          end
  );
$$;

-- has_own_perm: permissão limitada a registros atribuídos ao usuário (ex.: Colaborador no Kanban)
create or replace function public.has_own_perm(_module text, _action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role_id = p.role_id and rp.module = _module
    where p.id = auth.uid() and p.active and rp.scope = 'own'
      and case _action
            when 'edit'   then rp.can_edit
            when 'delete' then rp.can_delete
            else false
          end
  );
$$;

-- Permissões do usuário logado, para a interface montar menu e botões
create or replace function public.my_permissions()
returns table (module text, can_view boolean, can_create boolean, can_edit boolean,
               can_delete boolean, can_approve boolean, scope text)
language sql stable security definer set search_path = public as $$
  select m.key,
         public.is_admin() or coalesce(rp.can_view, false),
         public.is_admin() or coalesce(rp.can_create, false),
         public.is_admin() or coalesce(rp.can_edit, false),
         public.is_admin() or coalesce(rp.can_delete, false),
         public.is_admin() or coalesce(rp.can_approve, false),
         case when public.is_admin() then 'all' else coalesce(rp.scope, 'all') end
  from modules m
  left join profiles p on p.id = auth.uid() and p.active
  left join role_permissions rp on rp.role_id = p.role_id and rp.module = m.key
  order by m.sort_order;
$$;

-- -----------------------------------------------------------------------------
-- Políticas: cargos, permissões e perfis
-- -----------------------------------------------------------------------------
alter table public.roles enable row level security;
create policy roles_read  on public.roles for select to authenticated using (true);
create policy roles_admin on public.roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Cargos de sistema não podem ser excluídos nem ter a chave alterada
create or replace function public.guard_roles()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Cargos padrão não podem ser excluídos.' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.is_system and (new.key is distinct from old.key or not new.is_system) then
    raise exception 'A identificação de um cargo padrão não pode mudar.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.is_system := old.is_system;
  end if;
  return new;
end;
$$;
create trigger roles_guard before update or delete on public.roles
  for each row execute function public.guard_roles();

-- Novos cargos criados pela tela nunca são "de sistema"
create or replace function public.roles_force_custom()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.is_system := false;
  end if;
  return new;
end;
$$;
create trigger roles_force_custom before insert on public.roles
  for each row execute function public.roles_force_custom();

alter table public.role_permissions enable row level security;
create policy role_perms_read  on public.role_permissions for select to authenticated using (true);
create policy role_perms_admin on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.profiles enable row level security;
-- Colegas ativos se enxergam (necessário para atribuir responsáveis, mencionar etc.)
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Ninguém altera o próprio cargo/status; apenas Administradores alteram cargo/status
-- de outros; o último Administrador ativo não pode ser removido.
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin_role uuid;
begin
  if new.role_id is distinct from old.role_id or new.active is distinct from old.active then
    if auth.uid() is not null and new.id = auth.uid() then
      raise exception 'Você não pode alterar o próprio cargo ou status.' using errcode = '42501';
    end if;
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Apenas Administradores alteram cargos e status.' using errcode = '42501';
    end if;
    select id into admin_role from roles where key = 'admin';
    if old.role_id = admin_role and old.active
       and (new.role_id is distinct from admin_role or not new.active)
       and (select count(*) from profiles where role_id = admin_role and active) <= 1 then
      raise exception 'É preciso manter pelo menos um Administrador ativo.' using errcode = '42501';
    end if;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    new.email := old.email; -- e-mail é sincronizado pelo Auth, não pela tela
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Novo cadastro: o primeiro usuário vira Administrador ativo; os demais entram
-- como Colaborador inativo, aguardando aprovação.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
  domains jsonb;
begin
  select not exists (select 1 from profiles) into is_first;
  -- Se o Administrador restringiu domínios de e-mail, cadastros de fora são recusados
  select value->'allowed_domains' into domains from app_settings where key = 'signup';
  if not is_first and jsonb_typeof(domains) = 'array' and jsonb_array_length(domains) > 0
     and not exists (
       select 1 from jsonb_array_elements_text(domains) d
       where lower(split_part(coalesce(new.email, ''), '@', 2)) = lower(trim(leading '@' from d))
     ) then
    raise exception 'Cadastro permitido apenas para e-mails da organização.' using errcode = '42501';
  end if;
  insert into profiles (id, email, full_name, role_id, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    (select id from roles where key = case when is_first then 'admin' else 'colaborador' end),
    is_first
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Cargos iniciais e matriz de permissões (Administrador ajusta depois pela tela)
-- Códigos: T = total · E = ver/criar/editar · V = ver · C = ver/criar
--          K = ver + editar só o atribuído · sufixo A = também aprova · - = sem acesso
-- -----------------------------------------------------------------------------
insert into public.roles (key, name, description, is_system, sort_order) values
  ('admin',       'Administrador',         'Controle total, incluindo usuários, cargos, configurações e lixeira.', true, 10),
  ('diretoria',   'Diretoria',             'Vê tudo; aprova orçamento, compras, contratos e planejamento.',        true, 20),
  ('gestor',      'Gestor de Marketing',   'Gerencia todos os módulos e aprova demandas e conteúdos.',            true, 30),
  ('analista',    'Analista de Marketing', 'Cria e edita na operação e no relacionamento; solicita compras.',     true, 40),
  ('colaborador', 'Colaborador',           'Vê os módulos liberados e atualiza as tarefas atribuídas a ele.',     true, 50);

with matrix(module, admin, diretoria, gestor, analista, colaborador) as (values
  ('dashboard',     'T', 'V',  'T',  'V', 'V'),
  ('prioridades',   'T', 'V',  'T',  'V', 'V'),
  ('notificacoes',  'T', 'V',  'T',  'V', 'V'),
  ('planejamento',  'T', 'VA', 'T',  'V', '-'),
  ('indicadores',   'T', 'VA', 'T',  'V', '-'),
  ('campanhas',     'T', 'VA', 'T',  'E', 'V'),
  ('projetos',      'T', 'VA', 'T',  'E', 'V'),
  ('kanban',        'T', 'V',  'T',  'E', 'K'),
  ('calendario',    'T', 'V',  'T',  'E', 'K'),
  ('conteudos',     'T', 'V',  'TA', 'E', 'V'),
  ('parceiros',     'T', 'V',  'T',  'E', '-'),
  ('patrocinios',   'T', 'V',  'T',  'E', '-'),
  ('contratos',     'T', 'VA', 'T',  'E', '-'),
  ('eventos',       'T', 'V',  'T',  'E', 'K'),
  ('midia',         'T', 'V',  'T',  'E', 'V'),
  ('brindes',       'T', 'V',  'T',  'E', 'V'),
  ('fin_orcamento', 'T', 'VA', 'T',  '-', '-'),
  ('fin_compras',   'T', 'VA', 'TA', 'C', '-'),
  ('ia',            'T', 'V',  'T',  'E', '-'),
  ('analytics',     'T', 'V',  'T',  'E', '-'),
  ('workflows',     'T', '-',  'T',  'V', '-'),
  ('admin',         'T', '-',  '-',  '-', '-')
),
cells as (
  select module, 'admin' as role, admin as code from matrix
  union all select module, 'diretoria',   diretoria   from matrix
  union all select module, 'gestor',      gestor      from matrix
  union all select module, 'analista',    analista    from matrix
  union all select module, 'colaborador', colaborador from matrix
)
insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve, scope)
select r.id, c.module,
       left(c.code, 1) in ('T', 'E', 'V', 'C', 'K'),
       left(c.code, 1) in ('T', 'E', 'C'),
       left(c.code, 1) in ('T', 'E', 'K'),
       left(c.code, 1) = 'T',
       c.code like '%A' or c.role = 'admin',
       case when left(c.code, 1) = 'K' then 'own' else 'all' end
from cells c
join public.roles r on r.key = c.role
where c.code <> '-';

-- -----------------------------------------------------------------------------
-- Histórico de alterações (audit log)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('insert', 'update', 'delete', 'soft_delete', 'restore')),
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_record_idx on public.audit_log(table_name, record_id);
create index audit_log_time_idx on public.audit_log(changed_at desc);

alter table public.audit_log enable row level security;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
-- Nenhuma política de escrita: só os gatilhos (security definer) gravam.

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  act text;
  rid text;
begin
  if tg_op = 'INSERT' then
    act := 'insert'; rid := to_jsonb(new)->>'id';
  elsif tg_op = 'DELETE' then
    act := 'delete'; rid := to_jsonb(old)->>'id';
  else
    rid := to_jsonb(new)->>'id';
    if (to_jsonb(old)->>'deleted_at') is null and (to_jsonb(new)->>'deleted_at') is not null then
      act := 'soft_delete';
    elsif (to_jsonb(old)->>'deleted_at') is not null and (to_jsonb(new)->>'deleted_at') is null then
      act := 'restore';
    else
      act := 'update';
    end if;
    if to_jsonb(old) - 'updated_at' - 'updated_by' = to_jsonb(new) - 'updated_at' - 'updated_by' then
      return new; -- nada mudou de fato
    end if;
  end if;
  insert into audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (tg_table_name, rid, act, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger audit_roles after insert or update or delete on public.roles
  for each row execute function public.audit_row();

-- role_permissions não tem coluna id; registra a chave composta
create or replace function public.audit_role_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values ('role_permissions',
          coalesce(new.role_id, old.role_id)::text || ':' || coalesce(new.module, old.module),
          lower(tg_op), auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function public.audit_role_permissions();

-- -----------------------------------------------------------------------------
-- Padrão para tabelas de módulo (usado nas Fases 2 a 5)
--   Toda tabela de módulo tem: id uuid, title text, created_by, updated_by,
--   created_at, updated_at, deleted_at. Chamando
--     select public.register_module_table('public.campaigns', 'campanhas');
--   a tabela ganha: preenchimento automático de autor/datas, histórico,
--   lixeira e políticas de acesso baseadas na matriz de cargos.
--   Tabelas com responsável usam a coluna assignee_id para o escopo 'own'.
-- -----------------------------------------------------------------------------
create table public.module_tables (
  table_name  text primary key,          -- nome sem schema, ex.: 'campaigns'
  module      text not null references public.modules(key),
  title_column text not null default 'title'
);
alter table public.module_tables enable row level security;
create policy module_tables_read on public.module_tables for select to authenticated using (true);

create or replace function public.stamp_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mod text;
  has_assignee boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.deleted_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Excluir (mover para a lixeira) e restaurar exigem permissão de exclusão
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

create or replace function public.register_module_table(_table regclass, _module text, _title_column text default 'title')
returns void language plpgsql security definer set search_path = public as $$
declare
  t text := (select relname from pg_class where oid = _table);
  has_assignee boolean;
  own_clause text := '';
begin
  insert into module_tables (table_name, module, title_column) values (t, _module, _title_column)
  on conflict (table_name) do update set module = excluded.module, title_column = excluded.title_column;

  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = t and column_name = 'assignee_id')
    into has_assignee;
  if has_assignee then
    own_clause := format(' or (assignee_id = auth.uid() and public.has_own_perm(%L, ''edit''))', _module);
  end if;

  execute format('alter table public.%I enable row level security', t);
  execute format('drop trigger if exists %I on public.%I', t || '_stamp', t);
  execute format('create trigger %I before insert or update on public.%I for each row execute function public.stamp_row()', t || '_stamp', t);
  execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);

  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format('create policy %I on public.%I for select to authenticated using (public.has_perm(%L, ''view'') and (deleted_at is null or public.has_perm(%L, ''delete'')))', t || '_select', t, _module, _module);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_perm(%L, ''create''))', t || '_insert', t, _module);
  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format('create policy %I on public.%I for update to authenticated using (public.has_perm(%L, ''edit'')%s or public.has_perm(%L, ''delete'')) with check (public.has_perm(%L, ''edit'')%s or public.has_perm(%L, ''delete''))',
                 t || '_update', t, _module, own_clause, _module, _module, own_clause, _module);
  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
end;
$$;
revoke execute on function public.register_module_table(regclass, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Lixeira: lista e restauração de itens excluídos em qualquer módulo
-- -----------------------------------------------------------------------------
create or replace function public.list_trash()
returns table (table_name text, module text, record_id uuid, title text,
               deleted_at timestamptz, deleted_by uuid, purge_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  mt record;
begin
  for mt in select * from module_tables loop
    if public.has_perm(mt.module, 'delete') then
      return query execute format(
        'select %L::text, %L::text, id, %I::text, deleted_at, updated_by, deleted_at + interval ''30 days''
         from public.%I where deleted_at is not null',
        mt.table_name, mt.module, mt.title_column, mt.table_name);
    end if;
  end loop;
end;
$$;

create or replace function public.restore_item(_table text, _id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  mod text;
begin
  select module into mod from module_tables where table_name = _table;
  if mod is null then raise exception 'Tabela desconhecida.'; end if;
  if not public.has_perm(mod, 'delete') then
    raise exception 'Sem permissão para restaurar neste módulo.' using errcode = '42501';
  end if;
  execute format('update public.%I set deleted_at = null where id = $1', _table) using _id;
end;
$$;

-- Apaga de vez: um item (Administrador) ou tudo com mais de 30 dias na lixeira
create or replace function public.purge_item(_table text, _id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas Administradores apagam definitivamente.' using errcode = '42501';
  end if;
  if not exists (select 1 from module_tables where table_name = _table) then
    raise exception 'Tabela desconhecida.';
  end if;
  execute format('delete from public.%I where id = $1 and deleted_at is not null', _table) using _id;
end;
$$;

create or replace function public.purge_expired_trash()
returns int language plpgsql security definer set search_path = public as $$
declare
  mt record;
  n int;
  total int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Apenas Administradores esvaziam a lixeira.' using errcode = '42501';
  end if;
  for mt in select * from module_tables loop
    execute format('delete from public.%I where deleted_at < now() - interval ''30 days''', mt.table_name);
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  return total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anexos e comentários (genéricos: valem para qualquer registro de qualquer módulo)
-- -----------------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  module        text not null references public.modules(key),
  record_id     uuid not null,
  file_name     text not null,
  mime_type     text not null default 'application/octet-stream',
  size_bytes    bigint not null default 0,
  storage_path  text not null unique,
  created_by    uuid references auth.users(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index attachments_record_idx on public.attachments(module, record_id);

alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select to authenticated
  using (public.has_perm(module, 'view'));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.has_perm(module, 'create') or public.has_perm(module, 'edit') or public.has_own_perm(module, 'edit'));
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.has_perm(module, 'delete') or created_by = auth.uid());
create trigger audit_attachments after insert or delete on public.attachments
  for each row execute function public.audit_row();

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  module      text not null references public.modules(key),
  record_id   uuid not null,
  body        text not null check (length(trim(body)) > 0),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index comments_record_idx on public.comments(module, record_id, created_at);

alter table public.comments enable row level security;
create policy comments_select on public.comments for select to authenticated
  using (public.has_perm(module, 'view'));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.has_perm(module, 'view') and created_by = auth.uid());
create policy comments_update on public.comments for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- Bucket privado de anexos. Caminho: <modulo>/<record_id>/<uuid>-<nome do arquivo>
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.has_perm((storage.foldername(name))[1], 'view'));
create policy attachments_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (
    public.has_perm((storage.foldername(name))[1], 'create')
    or public.has_perm((storage.foldername(name))[1], 'edit')
    or public.has_own_perm((storage.foldername(name))[1], 'edit')));
create policy attachments_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (
    public.has_perm((storage.foldername(name))[1], 'delete') or owner = auth.uid()));

-- -----------------------------------------------------------------------------
-- Configurações gerais da plataforma (chave/valor)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy settings_read  on public.app_settings for select to authenticated using (public.is_active_user());
create policy settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create trigger audit_settings after insert or update or delete on public.app_settings
  for each row execute function public.audit_row();

insert into public.app_settings (key, value) values
  ('organization', '{"name": "Sicoob Credibelo", "area": "Marketing"}'),
  ('signup', '{"allowed_domains": []}');

-- Tempo real: telas atualizam sozinhas quando um colega altera algo
alter publication supabase_realtime add table public.profiles, public.role_permissions, public.comments, public.attachments;

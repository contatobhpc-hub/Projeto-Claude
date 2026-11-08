-- =============================================================================
-- Marketing Hub 2.0 — Fase 2: Operação
-- Campanhas, Projetos, Tarefas (Kanban), Calendário e Conteúdos.
-- Todas as tabelas usam o padrão da Fundação (register_module_table):
-- autor/datas automáticos, histórico, lixeira e permissões da matriz de cargos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Campanhas
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  type            text not null default 'Institucional'
                  check (type in ('Institucional','Produto','Sazonal','Lançamento','Endomarketing','Patrocínio','Performance')),
  objective       text not null default 'Awareness'
                  check (objective in ('Awareness','Geração de leads','Conversão','Engajamento','Relacionamento','Educação')),
  status          text not null default 'Rascunho'
                  check (status in ('Rascunho','Planejamento','Em andamento','Pausada','Concluída','Cancelada')),
  priority        text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
  description     text not null default '',
  notes           text not null default '',
  start_date      date,
  end_date        date,
  owner_id        uuid references public.profiles(id) on delete set null,
  products        text[] not null default '{}',
  budget          numeric(14,2) not null default 0 check (budget >= 0),
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
create index campaigns_status_idx on public.campaigns(status) where deleted_at is null;
create index campaigns_owner_idx on public.campaigns(owner_id);

-- -----------------------------------------------------------------------------
-- Projetos
-- -----------------------------------------------------------------------------
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  campaign_id     uuid references public.campaigns(id) on delete set null,
  requester_area  text not null default '',
  internal_client text not null default '',
  owner_id        uuid references public.profiles(id) on delete set null,
  team_ids        uuid[] not null default '{}',
  due_date        date,
  status          text not null default 'Backlog'
                  check (status in ('Backlog','Em andamento','Em revisão','Bloqueado','Concluído')),
  priority        text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
  description     text not null default '',
  approval_status text not null default 'Não solicitada'
                  check (approval_status in ('Não solicitada','Aguardando','Aprovada','Reprovada')),
  approval_note   text not null default '',
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index projects_campaign_idx on public.projects(campaign_id);
create index projects_owner_idx on public.projects(owner_id);

-- -----------------------------------------------------------------------------
-- Tarefas (Kanban)
-- -----------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  description  text not null default '',
  status       text not null default 'Backlog'
               check (status in ('Backlog','Planejamento','Em andamento','Aguardando Aprovação','Concluído','Cancelado')),
  priority     text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
  assignee_id  uuid references public.profiles(id) on delete set null,
  due_date     date,
  campaign_id  uuid references public.campaigns(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  labels       text[] not null default '{}',
  position     double precision not null default extract(epoch from now()),
  completed_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index tasks_board_idx on public.tasks(status, position) where deleted_at is null;
create index tasks_assignee_idx on public.tasks(assignee_id);
create index tasks_project_idx on public.tasks(project_id);
create index tasks_campaign_idx on public.tasks(campaign_id);

-- Data de conclusão automática
create or replace function public.tasks_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'Concluído' and (tg_op = 'INSERT' or old.status is distinct from 'Concluído') then
    new.completed_at := now();
  elsif new.status <> 'Concluído' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger tasks_completion before insert or update of status on public.tasks
  for each row execute function public.tasks_completion();

-- Quem só pode editar as próprias tarefas (Colaborador) não pode reatribuí-las a outra pessoa
-- nem mudar título, vínculos ou prazo; pode mudar status e descrição.
create or replace function public.tasks_guard_own()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_perm('kanban', 'edit') then
    if new.assignee_id is distinct from old.assignee_id
       or new.title is distinct from old.title
       or new.campaign_id is distinct from old.campaign_id
       or new.project_id is distinct from old.project_id
       or new.due_date is distinct from old.due_date
       or new.priority is distinct from old.priority then
      raise exception 'Seu cargo só permite atualizar status e descrição das tarefas atribuídas a você.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger tasks_guard_own before update on public.tasks
  for each row execute function public.tasks_guard_own();

-- -----------------------------------------------------------------------------
-- Calendário
-- -----------------------------------------------------------------------------
create table public.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(trim(title)) > 0),
  category        text not null default 'Reunião'
                  check (category in ('Campanha','Evento','Publicação','Reunião','Entrega','Prazo','Contrato',
                                      'Patrocínio','Outdoor','Rádio','Produção de vídeo','Aprovação')),
  status          text not null default 'Planejado'
                  check (status in ('Planejado','Em andamento','Concluído','Atrasado','Cancelado')),
  priority        text not null default 'Média' check (priority in ('Baixa','Média','Alta','Crítica')),
  event_date      date not null,
  start_time      time,
  duration_min    int check (duration_min is null or duration_min > 0),
  description     text not null default '',
  assignee_id     uuid references public.profiles(id) on delete set null,
  participant_ids uuid[] not null default '{}',
  agency          text not null default '',
  campaign_id     uuid references public.campaigns(id) on delete set null,
  project_id      uuid references public.projects(id) on delete set null,
  task_id         uuid references public.tasks(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index calendar_date_idx on public.calendar_events(event_date) where deleted_at is null;
create index calendar_campaign_idx on public.calendar_events(campaign_id);
create index calendar_project_idx on public.calendar_events(project_id);

-- -----------------------------------------------------------------------------
-- Conteúdos (biblioteca) + versões + favoritos
-- -----------------------------------------------------------------------------
create table public.content_items (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  category     text not null default 'Legendas'
               check (category in ('Legendas','Matérias','Roteiros','Spot Rádio','E-mails','Comunicados','Vídeos',
                                   'Stories','Reels','Campanhas','Templates','Arquivos Institucionais')),
  status       text not null default 'Rascunho'
               check (status in ('Rascunho','Em revisão','Aguardando aprovação','Aprovado','Publicado','Arquivado')),
  description  text not null default '',
  body         text not null default '',
  tags         text[] not null default '{}',
  campaign_id  uuid references public.campaigns(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  review_note  text not null default '',
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index content_status_idx on public.content_items(status) where deleted_at is null;
create index content_campaign_idx on public.content_items(campaign_id);

create table public.content_versions (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references public.content_items(id) on delete cascade,
  version_no  int not null,
  title       text not null,
  body        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (content_id, version_no)
);
alter table public.content_versions enable row level security;
create policy content_versions_read on public.content_versions for select to authenticated
  using (public.has_perm('conteudos', 'view'));
-- Sem políticas de escrita: versões são gravadas só pelo gatilho abaixo.

create or replace function public.content_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body or new.title is distinct from old.title then
    insert into content_versions (content_id, version_no, title, body, created_by)
    values (new.id,
            coalesce((select max(version_no) from content_versions where content_id = new.id), 0) + 1,
            new.title, new.body, auth.uid());
  end if;
  return new;
end;
$$;
create trigger content_snapshot after insert or update of body, title on public.content_items
  for each row execute function public.content_snapshot();

-- Fluxo de aprovação de conteúdo:
--  * só quem tem "Aprovar" em Conteúdos coloca em Aprovado (ou reprova, voltando para Em revisão);
--  * Publicado só a partir de Aprovado;
--  * editar o texto de um conteúdo aprovado/publicado (sem ser aprovador) volta para Em revisão.
create or replace function public.content_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  approver boolean := auth.uid() is null or public.has_perm('conteudos', 'approve');
begin
  if tg_op = 'INSERT' then
    if new.status in ('Aprovado', 'Publicado') and not approver then
      raise exception 'Somente aprovadores podem criar conteúdo já aprovado.' using errcode = '42501';
    end if;
    if new.status in ('Aprovado', 'Publicado') then
      new.approved_by := auth.uid(); new.approved_at := now();
    end if;
    return new;
  end if;

  if (new.body is distinct from old.body or new.title is distinct from old.title)
     and old.status in ('Aprovado', 'Publicado') and not approver then
    new.status := 'Em revisão';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'Aprovado' then
      if not approver then
        raise exception 'Somente aprovadores podem aprovar conteúdos.' using errcode = '42501';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    elsif new.status = 'Publicado' then
      if old.status <> 'Aprovado' and not approver then
        raise exception 'Só é possível publicar conteúdo aprovado.' using errcode = '42501';
      end if;
      if new.approved_by is null then
        new.approved_by := auth.uid(); new.approved_at := now();
      end if;
    elsif new.status in ('Rascunho', 'Em revisão', 'Aguardando aprovação') then
      new.approved_by := null;
      new.approved_at := null;
    end if;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;
create trigger content_workflow before insert or update on public.content_items
  for each row execute function public.content_workflow();

create table public.content_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
alter table public.content_favorites enable row level security;
create policy content_fav_own on public.content_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_perm('conteudos', 'view'));

-- -----------------------------------------------------------------------------
-- Aprovação de campanhas e projetos (Diretoria e quem tiver "Aprovar")
-- Quem edita pode pedir aprovação (Aguardando); só aprovadores decidem.
-- -----------------------------------------------------------------------------
create or replace function public.guard_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mod text;
begin
  select module into mod from module_tables where table_name = tg_table_name;
  if tg_op = 'INSERT' then
    if new.approval_status in ('Aprovada', 'Reprovada') and auth.uid() is not null
       and not public.has_perm(mod, 'approve') then
      new.approval_status := 'Não solicitada';
    end if;
    if new.approval_status not in ('Aprovada', 'Reprovada') then
      new.approved_by := null; new.approved_at := null;
    end if;
    return new;
  end if;

  if new.approval_status is distinct from old.approval_status then
    if new.approval_status in ('Aprovada', 'Reprovada') then
      if auth.uid() is not null and not public.has_perm(mod, 'approve') then
        raise exception 'Somente aprovadores podem aprovar ou reprovar.' using errcode = '42501';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
  else
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;

-- Decisão de aprovação: funciona mesmo para quem só tem "Ver + Aprovar" (Diretoria)
create or replace function public.decide_approval(_table text, _id uuid, _decision text, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  mod text;
  n int;
begin
  if _table not in ('campaigns', 'projects') then raise exception 'Tabela sem fluxo de aprovação.'; end if;
  if _decision not in ('Aprovada', 'Reprovada') then raise exception 'Decisão inválida.'; end if;
  select module into mod from module_tables where table_name = _table;
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

-- -----------------------------------------------------------------------------
-- Registra as tabelas no padrão (permissões, lixeira, histórico)
-- -----------------------------------------------------------------------------
select public.register_module_table('public.campaigns', 'campanhas', 'name');
select public.register_module_table('public.projects', 'projetos', 'name');
select public.register_module_table('public.tasks', 'kanban', 'title');
select public.register_module_table('public.calendar_events', 'calendario', 'title');
select public.register_module_table('public.content_items', 'conteudos', 'title');

create trigger campaigns_approval before insert or update on public.campaigns
  for each row execute function public.guard_approval();
create trigger projects_approval before insert or update on public.projects
  for each row execute function public.guard_approval();

-- Pode editar este registro? Edição total no módulo, ou escopo "só atribuídos"
-- e o registro (tarefa, evento…) está atribuído ao usuário.
create or replace function public.can_edit_record(_module text, _record_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  ok boolean := false;
begin
  if public.has_perm(_module, 'edit') then return true; end if;
  if not public.has_own_perm(_module, 'edit') then return false; end if;
  for t in select table_name from module_tables where module = _module loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'assignee_id') then
      execute format('select exists (select 1 from public.%I where id = $1 and assignee_id = auth.uid() and deleted_at is null)', t)
        into ok using _record_id;
      if ok then return true; end if;
    end if;
  end loop;
  return false;
end;
$$;

-- Converte texto em uuid sem erro (para caminhos de arquivo)
create or replace function public.try_uuid(_s text)
returns uuid language plpgsql immutable as $$
begin
  return _s::uuid;
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anexos e comentários passam a respeitar o escopo "só atribuídos"
-- (um Colaborador anexa/comenta só nas tarefas e eventos dele).
-- -----------------------------------------------------------------------------
drop policy attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.has_perm(module, 'create') or public.can_edit_record(module, record_id));

drop policy attachments_bucket_insert on storage.objects;
create policy attachments_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (
    public.has_perm((storage.foldername(name))[1], 'create')
    or public.can_edit_record((storage.foldername(name))[1], public.try_uuid((storage.foldername(name))[2]))));

-- -----------------------------------------------------------------------------
-- Checklist genérico (projetos, tarefas, eventos…)
-- -----------------------------------------------------------------------------
create table public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  module      text not null references public.modules(key),
  record_id   uuid not null,
  text        text not null check (length(trim(text)) > 0),
  done        boolean not null default false,
  position    double precision not null default extract(epoch from now()),
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index checklist_record_idx on public.checklist_items(module, record_id, position);
alter table public.checklist_items enable row level security;
create policy checklist_select on public.checklist_items for select to authenticated
  using (public.has_perm(module, 'view'));
create policy checklist_write on public.checklist_items for all to authenticated
  using (public.can_edit_record(module, record_id))
  with check (public.can_edit_record(module, record_id));

-- -----------------------------------------------------------------------------
-- Histórico de um registro (para a aba "Histórico" das telas de detalhe).
-- O log completo continua só para Administradores; aqui cada pessoa vê o
-- histórico dos registros que ela pode ver.
-- -----------------------------------------------------------------------------
create or replace function public.record_history(_table text, _id uuid)
returns table (id bigint, action text, changed_by uuid, changed_at timestamptz, old_data jsonb, new_data jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  mod text;
begin
  select module into mod from module_tables where table_name = _table;
  if mod is null or not public.has_perm(mod, 'view') then
    raise exception 'Sem acesso a este histórico.' using errcode = '42501';
  end if;
  return query
    select a.id, a.action, a.changed_by, a.changed_at, a.old_data, a.new_data
    from audit_log a
    where a.table_name = _table and a.record_id = _id::text
    order by a.changed_at desc
    limit 200;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tempo real
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.campaigns, public.projects, public.tasks, public.calendar_events,
  public.content_items, public.checklist_items;

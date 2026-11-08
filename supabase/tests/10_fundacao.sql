\set ON_ERROR_STOP 0
\pset pager off
-- Helper: act as a user
create or replace function test_as(_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), false);
end $$;

-- A tabela tasks vem da migração da Fase 2 (já registrada no módulo kanban).

-- Users: first signup becomes admin
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"full_name":"Ana Admin"}'),
 ('00000000-0000-0000-0000-00000000000b', 'analista@x.com', '{"full_name":"Bia Analista"}'),
 ('00000000-0000-0000-0000-00000000000c', 'colab@x.com', '{"full_name":"Caio Colab"}'),
 ('00000000-0000-0000-0000-00000000000d', 'dir@x.com', '{"full_name":"Davi Dir"}'),
 ('00000000-0000-0000-0000-00000000000e', 'novo@x.com', '{"full_name":"Eva Pendente"}');

\echo '== 1. Perfis criados (só o primeiro é admin ativo)'
select email, r.key as cargo, active from profiles p join roles r on r.id = p.role_id order by email;

set role authenticated;

\echo '== 2. Admin ativa e define cargos'
select test_as('00000000-0000-0000-0000-00000000000a');
update profiles set active = true, role_id = (select id from roles where key='analista') where email='analista@x.com';
update profiles set active = true where email='colab@x.com';
update profiles set active = true, role_id = (select id from roles where key='diretoria') where email='dir@x.com';
select email, r.key as cargo, active from profiles p join roles r on r.id = p.role_id order by email;

\echo '== 3. Admin não pode alterar o próprio cargo (espera ERRO)'
update profiles set role_id = (select id from roles where key='gestor') where email='admin@x.com';

\echo '== 4. Analista tenta se promover (espera ERRO)'
select test_as('00000000-0000-0000-0000-00000000000b');
update profiles set role_id = (select id from roles where key='admin') where email='analista@x.com';
\echo '== 4b. Analista tenta promover colega (espera 0 linhas ou ERRO)'
update profiles set role_id = (select id from roles where key='admin') where email='colab@x.com';
\echo '== 4c. Analista edita o próprio nome (espera OK)'
update profiles set full_name = 'Bia A. Silva' where email='analista@x.com';

\echo '== 5. Pendente não vê colegas (espera só a própria linha)'
select test_as('00000000-0000-0000-0000-00000000000e');
select email from profiles;
\echo '== 5b. Pendente não vê tarefas'
select count(*) as tarefas_visiveis from tasks;

\echo '== 6. Analista cria tarefas (permitido: kanban = E)'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into tasks (title, assignee_id) values ('Arte do Dia C', '00000000-0000-0000-0000-00000000000c'),
                                              ('Post Instagram', '00000000-0000-0000-0000-00000000000b');
select title, created_by = '00000000-0000-0000-0000-00000000000b' as autor_ok from tasks order by title;

\echo '== 7. Analista tenta excluir (mover p/ lixeira) — espera ERRO'
update tasks set deleted_at = now() where title='Post Instagram';

\echo '== 8. Colaborador edita tarefa atribuída a ele (espera 1 linha)'
select test_as('00000000-0000-0000-0000-00000000000c');
update tasks set status = 'Em andamento' where title='Arte do Dia C';
\echo '== 8b. Colaborador tenta editar tarefa de outro (espera UPDATE 0)'
update tasks set status = 'Cancelado' where title='Post Instagram';
\echo '== 8c. Colaborador tenta criar tarefa (espera ERRO)'
insert into tasks (title) values ('não devia');

\echo '== 9. Diretoria só vê, não cria (espera ERRO)'
select test_as('00000000-0000-0000-0000-00000000000d');
select count(*) as diretoria_ve from tasks;
insert into tasks (title) values ('não devia');

\echo '== 10. Admin move para a lixeira, lista e restaura'
select test_as('00000000-0000-0000-0000-00000000000a');
update tasks set deleted_at = now() where title='Post Instagram';
select table_name, title, purge_at > now() + interval '29 days' as prazo_30d from list_trash();
select test_as('00000000-0000-0000-0000-00000000000b');
select count(*) as analista_ve_apos_exclusao from tasks;
select count(*) as analista_ve_lixeira from list_trash();
select test_as('00000000-0000-0000-0000-00000000000a');
select restore_item('tasks', (select id from tasks where title='Post Instagram'));
select title, deleted_at is null as ativo from tasks order by title;

\echo '== 11. Histórico de alterações'
select table_name, action, count(*) from audit_log group by 1,2 order by 1,2;
select test_as('00000000-0000-0000-0000-00000000000b');
\echo '== 11b. Analista não lê o histórico (espera 0)'
select count(*) from audit_log;

\echo '== 12. Permissões do analista (amostra)'
select module, can_view, can_create, can_edit, can_delete, can_approve, scope from my_permissions()
where module in ('kanban','fin_compras','fin_orcamento','admin');
\echo '== 12b. Permissões do colaborador (kanban)'
select test_as('00000000-0000-0000-0000-00000000000c');
select module, can_view, can_edit, scope from my_permissions() where module in ('kanban','contratos');

\echo '== 13. Último admin não pode ser desativado (via outro admin inexistente: tentativa direta)'
select test_as('00000000-0000-0000-0000-00000000000a');
update profiles set role_id = (select id from roles where key='admin') where email='dir@x.com';
select test_as('00000000-0000-0000-0000-00000000000d');
update profiles set active = false where email='admin@x.com';
select email, active from profiles where email='admin@x.com';
\echo '== 13b. Agora com 1 admin restante, Davi tenta se rebaixar (espera ERRO - próprio cargo)'
update profiles set role_id = (select id from roles where key='gestor') where email='dir@x.com';

\echo '== 14. Anexos: analista anexa em kanban; colaborador sem acesso a contratos'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into attachments (module, record_id, file_name, storage_path) values ('kanban', gen_random_uuid(), 'briefing.pdf', 'kanban/x/briefing.pdf');
insert into storage.objects (bucket_id, name, owner) values ('attachments', 'kanban/abc/1-briefing.pdf', auth.uid());
select test_as('00000000-0000-0000-0000-00000000000c');
insert into storage.objects (bucket_id, name, owner) values ('attachments', 'contratos/abc/1-x.pdf', auth.uid());
select count(*) as colab_ve_objetos from storage.objects;

\echo '== 15. Analista não consegue chamar register_module_table (espera ERRO)'
select test_as('00000000-0000-0000-0000-00000000000b');
select public.register_module_table('public.tasks', 'admin');
reset role;

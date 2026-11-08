\pset pager off
-- Fase 2 — Operação. Roda depois dos testes 10 e 11 (usa os mesmos usuários):
--   b = Analista · c = Colaborador · d = Administrador (Davi)
--   f2 = João → vira Gestor · f3 = Diná → vira Diretoria
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'dina@sicoob.com.br');
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000d');
update profiles set active = true, role_id = (select id from roles where key='gestor') where email='joao@SICOOB.com.br';
update profiles set active = true, role_id = (select id from roles where key='diretoria') where email='dina@sicoob.com.br';

\echo '== 20. Analista cria campanha, projeto vinculado, tarefa e evento'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into campaigns (id, name, type, budget, start_date, end_date)
  values ('10000000-0000-0000-0000-000000000001', 'Dia C 2026', 'Institucional', 15000, '2026-11-01', '2026-11-30');
insert into projects (id, name, campaign_id) values ('20000000-0000-0000-0000-000000000001', 'Ação Dia C', '10000000-0000-0000-0000-000000000001');
insert into tasks (id, title, project_id, campaign_id, assignee_id)
  values ('30000000-0000-0000-0000-000000000001', 'Criar arte', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
insert into calendar_events (title, event_date, campaign_id, assignee_id)
  values ('Gravação do vídeo', '2026-11-12', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
select (select count(*) from campaigns) c, (select count(*) from projects) p, (select count(*) from tasks where project_id is not null) t, (select count(*) from calendar_events) e;

\echo '== 21. Campanha com fim antes do início (espera ERRO)'
insert into campaigns (name, start_date, end_date) values ('Errada', '2026-12-10', '2026-12-01');

\echo '== 22. Analista tenta aprovar a própria campanha direto (espera ERRO)'
update campaigns set approval_status = 'Aprovada' where id = '10000000-0000-0000-0000-000000000001';
\echo '== 22b. Analista pede aprovação (espera OK: Aguardando)'
update campaigns set approval_status = 'Aguardando' where id = '10000000-0000-0000-0000-000000000001';
select approval_status from campaigns;

\echo '== 23. Diretoria não edita a campanha (espera UPDATE 0) mas aprova pela função'
select test_as('00000000-0000-0000-0000-0000000000f3');
update campaigns set budget = 1 where id = '10000000-0000-0000-0000-000000000001';
select decide_approval('campaigns', '10000000-0000-0000-0000-000000000001', 'Aprovada', 'Ok, seguir.');
select approval_status, approval_note, approved_by = '00000000-0000-0000-0000-0000000000f3' as aprovador_ok, budget from campaigns;
\echo '== 23b. Aprovar de novo algo já decidido (espera ERRO)'
select decide_approval('campaigns', '10000000-0000-0000-0000-000000000001', 'Reprovada', '');
\echo '== 23c. Diretoria não aprova tarefas (sem flag aprovar no kanban) — espera ERRO de tabela'
select decide_approval('tasks', '30000000-0000-0000-0000-000000000001', 'Aprovada', '');

\echo '== 24. Colaborador move a própria tarefa e anexa/checklist nela (espera OK)'
select test_as('00000000-0000-0000-0000-00000000000c');
update tasks set status = 'Concluído' where id = '30000000-0000-0000-0000-000000000001';
select status, completed_at is not null as concluida from tasks where id = '30000000-0000-0000-0000-000000000001';
insert into checklist_items (module, record_id, text) values ('kanban', '30000000-0000-0000-0000-000000000001', 'Revisar cores');
insert into attachments (module, record_id, file_name, storage_path) values ('kanban', '30000000-0000-0000-0000-000000000001', 'arte.png', 'kanban/30000000-0000-0000-0000-000000000001/arte.png');
insert into storage.objects (bucket_id, name, owner) values ('attachments', 'kanban/30000000-0000-0000-0000-000000000001/x-arte.png', auth.uid());
\echo '== 24b. Colaborador tenta reatribuir a própria tarefa a outra pessoa (espera ERRO)'
update tasks set assignee_id = '00000000-0000-0000-0000-00000000000b' where id = '30000000-0000-0000-0000-000000000001';
\echo '== 24c. Colaborador tenta checklist em projeto (sem edição) — espera ERRO'
insert into checklist_items (module, record_id, text) values ('projetos', '20000000-0000-0000-0000-000000000001', 'não devia');
\echo '== 24d. Colaborador tenta anexar em tarefa que não é dele (espera ERRO)'
reset role;
insert into tasks (id, title, assignee_id) values ('30000000-0000-0000-0000-000000000002', 'Tarefa da Bia', '00000000-0000-0000-0000-00000000000b');
set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000c');
insert into attachments (module, record_id, file_name, storage_path) values ('kanban', '30000000-0000-0000-0000-000000000002', 'x.png', 'kanban/30000000-0000-0000-0000-000000000002/x.png');
\echo '== 24e. Colaborador edita o próprio evento (espera UPDATE 1)'
update calendar_events set status = 'Concluído' where title = 'Gravação do vídeo';
\echo '== 24f. Colaborador vê campanhas (V) mas não projetos? Projetos = V, também vê'
select (select count(*) from campaigns) campanhas, (select count(*) from projects) projetos;

\echo '== 25. Conteúdo: analista cria, edita (gera versões), tenta aprovar (ERRO)'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into content_items (id, title, body) values ('40000000-0000-0000-0000-000000000001', 'Legenda Dia C', 'Texto v1');
update content_items set body = 'Texto v2' where id = '40000000-0000-0000-0000-000000000001';
update content_items set status = 'Aguardando aprovação' where id = '40000000-0000-0000-0000-000000000001';
select count(*) as versoes from content_versions where content_id = '40000000-0000-0000-0000-000000000001';
update content_items set status = 'Aprovado' where id = '40000000-0000-0000-0000-000000000001';
\echo '== 25b. Analista tenta criar já aprovado (espera ERRO)'
insert into content_items (title, status) values ('Atalho', 'Aprovado');

\echo '== 26. Gestor aprova; analista edita depois → volta para Em revisão'
select test_as('00000000-0000-0000-0000-0000000000f2');
update content_items set status = 'Aprovado' where id = '40000000-0000-0000-0000-000000000001';
select status, approved_by = '00000000-0000-0000-0000-0000000000f2' as aprovador_ok from content_items;
select test_as('00000000-0000-0000-0000-00000000000b');
update content_items set body = 'Texto v3 alterado depois' where id = '40000000-0000-0000-0000-000000000001';
select status, approved_by is null as aprovacao_limpa from content_items;
\echo '== 26b. Analista não publica sem aprovação (espera ERRO)'
update content_items set status = 'Publicado' where id = '40000000-0000-0000-0000-000000000001';
\echo '== 26c. Favoritos são individuais'
insert into content_favorites (content_id) values ('40000000-0000-0000-0000-000000000001');
select test_as('00000000-0000-0000-0000-0000000000f2');
select count(*) as favoritos_do_gestor from content_favorites;

\echo '== 27. Histórico do registro: analista vê o da campanha; colaborador não vê o de conteúdo (sem acesso? conteudos=V → vê)'
select test_as('00000000-0000-0000-0000-00000000000b');
select action, count(*) from record_history('campaigns', '10000000-0000-0000-0000-000000000001') group by 1 order by 1;
select test_as('00000000-0000-0000-0000-0000000000f3');
\echo '== 27b. Diretoria sem acesso a workflows: histórico de tabela inexistente (espera ERRO)'
select * from record_history('nada', '10000000-0000-0000-0000-000000000001');

\echo '== 28. Gestor exclui campanha → lixeira; itens vinculados mantêm-se'
select test_as('00000000-0000-0000-0000-0000000000f2');
update campaigns set deleted_at = now() where id = '10000000-0000-0000-0000-000000000001';
select table_name, title from list_trash() order by 1;
select test_as('00000000-0000-0000-0000-00000000000b');
select count(*) as analista_ve_campanhas from campaigns;
select count(*) as projeto_continua from projects where campaign_id = '10000000-0000-0000-0000-000000000001';
reset role;

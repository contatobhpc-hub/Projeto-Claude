\pset pager off
-- Fase 5 — Inteligência. Usuários dos testes anteriores:
--   b = Analista · c = Colaborador · d = Administrador · f2 = Gestor · f3 = Diretoria
set role authenticated;

\echo '== 60. Tarefa atribuída gera notificação para o responsável (não para quem criou)'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into tasks (id, title, assignee_id, due_date) values ('c0000000-0000-0000-0000-000000000001', 'Revisar folder', '00000000-0000-0000-0000-00000000000c', current_date - 1);
select test_as('00000000-0000-0000-0000-00000000000c');
select kind, title from notifications order by created_at;
select test_as('00000000-0000-0000-0000-00000000000b');
select count(*) as analista_recebeu from notifications where title like '%Revisar folder%';

\echo '== 61. Ninguém cria notificação direto (espera ERRO)'
insert into notifications (user_id, title) values ('00000000-0000-0000-0000-00000000000c', 'falsa');

\echo '== 62. Pedido de aprovação de campanha avisa aprovadores (Diretoria e Admin)'
insert into campaigns (id, name) values ('10000000-0000-0000-0000-000000000009', 'Black Friday Sicoob');
update campaigns set approval_status = 'Aguardando' where id = '10000000-0000-0000-0000-000000000009';
select test_as('00000000-0000-0000-0000-0000000000f3');
select title, link from notifications where title like '%Black Friday%';
select decide_approval('campaigns', '10000000-0000-0000-0000-000000000009', 'Aprovada', 'Pode seguir');
select test_as('00000000-0000-0000-0000-00000000000b');
select title, body from notifications where title like 'Campanha aprovada%';

\echo '== 63. Compra enviada avisa aprovadores; decisão avisa o solicitante'
insert into purchase_requests (id, description, estimated_value, status) values ('a0000000-0000-0000-0000-000000000009', 'Camisetas Dia C', 1200, 'Solicitado');
select test_as('00000000-0000-0000-0000-0000000000f2');
select count(*) as gestor_avisado from notifications where record_id = 'a0000000-0000-0000-0000-000000000009';
select decide_purchase('a0000000-0000-0000-0000-000000000009', 'Aprovado', 'Ok');
select test_as('00000000-0000-0000-0000-00000000000b');
select title from notifications where record_id = 'a0000000-0000-0000-0000-000000000009';

\echo '== 64. Varredura diária: gera alertas e não duplica na segunda vez'
select test_as('00000000-0000-0000-0000-00000000000c');
select generate_due_notifications() > 0 as gerou;
select generate_due_notifications() as segunda_vez;
select title from notifications where kind = 'deadline' order by title;

\echo '== 65. Cada um marca as suas como lidas; não vê as dos outros'
update notifications set read_at = now();
select test_as('00000000-0000-0000-0000-0000000000f2');
select count(*) filter (where read_at is not null) as lidas_do_gestor from notifications;

\echo '== 66. Workflow: campanha criada → tarefa para o responsável + checklist + aviso à Diretoria'
select test_as('00000000-0000-0000-0000-0000000000f2');
insert into workflow_rules (id, name, trigger, actions) values ('d0000000-0000-0000-0000-000000000001', 'Kit de nova campanha', 'campaign_created',
  '[{"type":"create_task","title":"Briefing de {nome}","assignee_id":"owner","due_in_days":3,"priority":"Alta"},
    {"type":"add_checklist","items":["Briefing","Arte","Aprovação"]},
    {"type":"notify","target":"role:diretoria","message":"Nova campanha: {nome}"},
    {"type":"inexistente"}]');
select test_as('00000000-0000-0000-0000-00000000000b');
insert into campaigns (id, name, owner_id) values ('10000000-0000-0000-0000-000000000010', 'Consórcio Premiado', '00000000-0000-0000-0000-00000000000b');
select title, assignee_id = '00000000-0000-0000-0000-00000000000b' as para_dono, priority, due_date = current_date + 3 as prazo_ok
  from tasks where campaign_id = '10000000-0000-0000-0000-000000000010';
select count(*) as itens_checklist from checklist_items where record_id = '10000000-0000-0000-0000-000000000010';
select status, log from workflow_runs;
select test_as('00000000-0000-0000-0000-0000000000f3');
select title from notifications where title like 'Nova campanha%';
\echo '== 66b. Analista não cria workflow (só vê) — espera ERRO'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into workflow_rules (name, trigger) values ('x', 'task_done');

\echo '== 67. Workflow com condição: só dispara quando status = Em andamento'
select test_as('00000000-0000-0000-0000-0000000000f2');
insert into workflow_rules (name, trigger, condition_field, condition_value, actions) values ('Avisar dono ao iniciar', 'campaign_status', 'status', 'Em andamento',
  '[{"type":"notify","target":"owner","message":"{nome} começou!"}]');
update campaigns set status = 'Planejamento' where id = '10000000-0000-0000-0000-000000000010';
update campaigns set status = 'Em andamento' where id = '10000000-0000-0000-0000-000000000010';
select count(*) as execucoes_da_regra from workflow_runs r join workflow_rules w on w.id = r.rule_id where w.name = 'Avisar dono ao iniciar';

\echo '== 68. Planejamento: Gestor cria objetivo + resultado-chave; Diretoria aprova; Analista só lê'
insert into strategic_objectives (id, year, title, perspective) values ('e0000000-0000-0000-0000-000000000001', 2026, 'Aumentar base de cooperados', 'Negócios');
insert into indicators (id, name, unit, target) values ('e1000000-0000-0000-0000-000000000001', 'Novos cooperados', 'pessoas', 1200);
insert into indicator_values (indicator_id, period, value) values ('e1000000-0000-0000-0000-000000000001', '2026-10-01', 95), ('e1000000-0000-0000-0000-000000000001', '2026-11-01', 110);
insert into key_results (objective_id, title, target, indicator_id) values ('e0000000-0000-0000-0000-000000000001', '1.200 novos cooperados', 1200, 'e1000000-0000-0000-0000-000000000001');
update strategic_objectives set approval_status = 'Aguardando' where id = 'e0000000-0000-0000-0000-000000000001';
select test_as('00000000-0000-0000-0000-0000000000f3');
select decide_approval('strategic_objectives', 'e0000000-0000-0000-0000-000000000001', 'Aprovada', '');
select approval_status from strategic_objectives;
select test_as('00000000-0000-0000-0000-00000000000b');
select (select count(*) from key_results) krs, (select count(*) from indicator_values) valores;
insert into key_results (objective_id, title, target) values ('e0000000-0000-0000-0000-000000000001', 'não devia', 1);

\echo '== 69. Central IA: conversa é privada; ninguém grava resposta "assistant" pelo app'
insert into ai_conversations (id, title) values ('f0000000-0000-0000-0000-000000000001', 'Legenda Dia C');
insert into ai_messages (conversation_id, role, content) values ('f0000000-0000-0000-0000-000000000001', 'user', 'Crie uma legenda');
insert into ai_messages (conversation_id, role, content) values ('f0000000-0000-0000-0000-000000000001', 'assistant', 'resposta forjada');
select ai_usage_this_month() as perguntas_no_mes;
select test_as('00000000-0000-0000-0000-0000000000f2');
select count(*) as gestor_ve_conversa_da_analista from ai_conversations;
\echo '== 69b. Colaborador não usa a Central IA (sem acesso) — espera ERRO'
select test_as('00000000-0000-0000-0000-00000000000c');
insert into ai_conversations (title) values ('x');

\echo '== 70. Importação: só Administrador; preserva status e saldo originais'
select test_as('00000000-0000-0000-0000-0000000000f2');
select import_rows('campaigns', '[{"name":"Antiga"}]');
select test_as('00000000-0000-0000-0000-00000000000d');
select import_rows('purchase_requests', '[{"id":"a0000000-0000-0000-0000-0000000000ff","code":"PC-2026-0900","description":"Compra antiga","estimated_value":800,"status":"Concluído","created_at":"2026-03-10T12:00:00Z"}]') as compras;
select import_rows('inventory_items', '[{"id":"80000000-0000-0000-0000-0000000000ff","name":"Squeeze antigo","quantity":340}]') as brindes;
select import_rows('expenses', '[{"description":"Outdoor março","unit_value":4500,"budget_category":"Mídia Offline","expense_date":"2026-03-15","total":999}]') as despesas;
select code, status, created_at::date from purchase_requests where id = 'a0000000-0000-0000-0000-0000000000ff';
select quantity from inventory_items where id = '80000000-0000-0000-0000-0000000000ff';
select total from expenses where description = 'Outdoor março';
select import_rows('profiles', '[]');
reset role;

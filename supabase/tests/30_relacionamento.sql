\pset pager off
-- Fase 3 — Relacionamento e materiais. Usa os usuários dos testes anteriores:
--   b = Analista · c = Colaborador · d = Administrador · f2 = Gestor · f3 = Diretoria
set role authenticated;

\echo '== 30. Analista cadastra parceiro, contrato vinculado e pede aprovação'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into partners (id, company, category, status) values ('50000000-0000-0000-0000-000000000001', 'Rádio Campo Belo FM', 'Rádio', 'Ativo');
insert into contracts (id, object, partner_id, value, start_date, end_date)
  values ('60000000-0000-0000-0000-000000000001', 'Spots mensais 2026', '50000000-0000-0000-0000-000000000001', 24000, '2026-01-01', '2026-12-31');
update contracts set approval_status = 'Aguardando' where id = '60000000-0000-0000-0000-000000000001';
select object, approval_status from contracts;

\echo '== 31. Diretoria aprova o contrato pela função genérica'
select test_as('00000000-0000-0000-0000-0000000000f3');
select decide_approval('contracts', '60000000-0000-0000-0000-000000000001', 'Aprovada', 'De acordo.');
select approval_status, approved_by = '00000000-0000-0000-0000-0000000000f3' as ok from contracts;
\echo '== 31b. Diretoria não aprova parceiros (tabela sem fluxo) — espera ERRO'
select decide_approval('partners', '50000000-0000-0000-0000-000000000001', 'Aprovada', '');

\echo '== 32. Colaborador não vê parceiros nem contratos (sem acesso) — espera 0 e 0'
select test_as('00000000-0000-0000-0000-00000000000c');
select (select count(*) from partners) parceiros, (select count(*) from contracts) contratos;

\echo '== 33. Evento com responsável = Colaborador; ele edita convidados, outro evento não'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into events (id, name, event_date, assignee_id) values ('70000000-0000-0000-0000-000000000001', 'Assembleia 2026', '2026-12-05', '00000000-0000-0000-0000-00000000000c');
insert into events (id, name, event_date) values ('70000000-0000-0000-0000-000000000002', 'Feira do Agro', '2026-12-10');
select test_as('00000000-0000-0000-0000-00000000000c');
insert into event_attendees (event_id, name) values ('70000000-0000-0000-0000-000000000001', 'Prefeito');
update events set status = 'Confirmado' where id = '70000000-0000-0000-0000-000000000001';
select name, status from events order by name;
\echo '== 33b. Colaborador tenta incluir convidado em evento que não é dele (espera ERRO)'
insert into event_attendees (event_id, name) values ('70000000-0000-0000-0000-000000000002', 'Intruso');

\echo '== 34. Brindes: saldo só muda por movimentação'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into inventory_items (id, code, name, quantity) values ('80000000-0000-0000-0000-000000000001', 'CAN-01', 'Caneta Sicoob', 999);
select quantity as saldo_ignorado from inventory_items;
insert into inventory_movements (item_id, type, quantity, reason) values ('80000000-0000-0000-0000-000000000001', 'Entrada', 100, 'Compra');
insert into inventory_movements (item_id, type, quantity, reason, event_id) values ('80000000-0000-0000-0000-000000000001', 'Reserva', 30, 'Assembleia', '70000000-0000-0000-0000-000000000001');
insert into inventory_movements (item_id, type, quantity, from_reserve, event_id) values ('80000000-0000-0000-0000-000000000001', 'Saída', 20, true, '70000000-0000-0000-0000-000000000001');
update inventory_items set quantity = 5000 where id = '80000000-0000-0000-0000-000000000001';
select quantity, reserved, quantity - reserved as disponivel from inventory_items;
\echo '== 34b. Saída maior que o disponível (espera ERRO)'
insert into inventory_movements (item_id, type, quantity) values ('80000000-0000-0000-0000-000000000001', 'Saída', 75);
\echo '== 34c. Inventário ajusta para a contagem e registra a diferença'
insert into inventory_movements (item_id, type, quantity, reason) values ('80000000-0000-0000-0000-000000000001', 'Inventário', 70, 'Contagem de novembro');
select quantity, reserved from inventory_items;
select type, quantity, delta from inventory_movements order by created_at;
\echo '== 34d. Movimentação não pode ser apagada (espera DELETE 0)'
delete from inventory_movements;
select count(*) as movimentos from inventory_movements;
\echo '== 34e. Colaborador não movimenta estoque (espera ERRO)'
select test_as('00000000-0000-0000-0000-00000000000c');
insert into inventory_movements (item_id, type, quantity) values ('80000000-0000-0000-0000-000000000001', 'Saída', 1);

\echo '== 35. Patrocínios: mesma linha duas vezes é recusada (importação)'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into sponsorships (event_name, institution, start_date, value) values ('Festa do Galeto', 'Loja Maçônica', '2026-05-23', 3000);
insert into sponsorships (event_name, institution, start_date, value) values ('festa do galeto', 'LOJA MAÇÔNICA', '2026-05-23', 3000);
select count(*) as patrocinios from sponsorships;

\echo '== 36. Mídia offline: retirada antes da instalação (espera ERRO)'
insert into offline_media (title, install_date, removal_date) values ('Outdoor Av. Brasil', '2026-11-10', '2026-11-01');
insert into offline_media (title, categories, install_date, removal_date) values ('Outdoor Av. Brasil', '{Outdoor}', '2026-11-01', '2026-11-30');
select title, categories from offline_media;

\echo '== 37. Gestor exclui parceiro → lixeira; contrato continua'
select test_as('00000000-0000-0000-0000-0000000000f2');
update partners set deleted_at = now() where id = '50000000-0000-0000-0000-000000000001';
select table_name, title from list_trash() where table_name = 'partners';
select count(*) as contratos from contracts;
reset role;

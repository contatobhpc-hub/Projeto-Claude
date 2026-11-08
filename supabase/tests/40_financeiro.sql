\pset pager off
-- Fase 4 — Financeiro. Usuários dos testes anteriores:
--   b = Analista · c = Colaborador · d = Administrador · f2 = Gestor · f3 = Diretoria
set role authenticated;

\echo '== 40. Gestor cria orçamento; valor aprovado digitado por ele é ignorado'
select test_as('00000000-0000-0000-0000-0000000000f2');
insert into budget_lines (id, year, category, planned, approved)
  values ('90000000-0000-0000-0000-000000000001', 2026, 'Eventos', 50000, 50000);
select category, planned, approved from budget_lines;
\echo '== 40b. Gestor tenta mudar o aprovado (espera ERRO)'
update budget_lines set approved = 40000 where id = '90000000-0000-0000-0000-000000000001';
\echo '== 40c. Diretoria aprova 45.000 pela função'
select test_as('00000000-0000-0000-0000-0000000000f3');
select approve_budget_line('90000000-0000-0000-0000-000000000001', 45000);
select approved, approved_by = '00000000-0000-0000-0000-0000000000f3' as quem from budget_lines;

\echo '== 41. Analista não vê orçamento (sem acesso) mas vê centros de custo para pedir compra'
select test_as('00000000-0000-0000-0000-00000000000b');
select (select count(*) from budget_lines) orcamento, (select count(*) > 0 from cost_centers) ve_centros;

\echo '== 42. Analista pede compra de R$ 3.000 (dentro da alçada) e tenta aprovar a própria (ERRO)'
insert into purchase_requests (id, description, estimated_value, budget_category, status)
  values ('a0000000-0000-0000-0000-000000000001', 'Coffee break Assembleia', 3000, 'Eventos', 'Solicitado');
select code like 'PC-%-0001' as codigo_ok, status, requester_id = '00000000-0000-0000-0000-00000000000b' as solicitante from purchase_requests;
select decide_purchase('a0000000-0000-0000-0000-000000000001', 'Aprovado', '');
\echo '== 42b. Analista tenta marcar como Aprovado direto (espera ERRO)'
update purchase_requests set status = 'Aprovado' where id = 'a0000000-0000-0000-0000-000000000001';

\echo '== 43. Gestor aprova (dentro da alçada → Aprovado direto)'
select test_as('00000000-0000-0000-0000-0000000000f2');
select decide_purchase('a0000000-0000-0000-0000-000000000001', 'Aprovado', 'Ok');
\echo '== 43b. Depois de aprovada, ninguém altera o valor (espera ERRO)'
update purchase_requests set estimated_value = 9000 where id = 'a0000000-0000-0000-0000-000000000001';
update purchase_requests set status = 'Comprado', final_value = 2800 where id = 'a0000000-0000-0000-0000-000000000001';
select status, final_value from purchase_requests where id = 'a0000000-0000-0000-0000-000000000001';

\echo '== 44. Compra de R$ 12.000 (acima da alçada): Gestor aprova → Em aprovação; Gestor de novo (ERRO); Diretoria aprova'
select test_as('00000000-0000-0000-0000-00000000000b');
insert into purchase_requests (id, description, estimated_value, budget_category, status)
  values ('a0000000-0000-0000-0000-000000000002', 'Palco e som Feira', 12000, 'Eventos', 'Solicitado');
select test_as('00000000-0000-0000-0000-0000000000f2');
select decide_purchase('a0000000-0000-0000-0000-000000000002', 'Aprovado', '') as apos_gestor;
select decide_purchase('a0000000-0000-0000-0000-000000000002', 'Aprovado', '');
select test_as('00000000-0000-0000-0000-0000000000f3');
select decide_purchase('a0000000-0000-0000-0000-000000000002', 'Aprovado', 'Liberado') as apos_diretoria;
select level, decision from purchase_approvals where request_id = 'a0000000-0000-0000-0000-000000000002' order by decided_at;

\echo '== 44b. Gestor pede uma compra e tenta aprovar o próprio pedido (espera ERRO: segregação)'
select test_as('00000000-0000-0000-0000-0000000000f2');
insert into purchase_requests (id, description, estimated_value, status) values ('a0000000-0000-0000-0000-000000000003', 'Banner', 500, 'Solicitado');
select decide_purchase('a0000000-0000-0000-0000-000000000003', 'Aprovado', '');
\echo '== 44c. Diretoria recusa o pedido do Gestor'
select test_as('00000000-0000-0000-0000-0000000000f3');
select decide_purchase('a0000000-0000-0000-0000-000000000003', 'Recusado', 'Usar o banner do ano passado');

\echo '== 45. Nota fiscal: Gestor lança; status digitado é ignorado; Gestor não aprova (ERRO)'
select test_as('00000000-0000-0000-0000-0000000000f2');
insert into invoices (id, number, supplier_name, value, budget_category, purchase_request_id, status, due_date)
  values ('b0000000-0000-0000-0000-000000000001', '1234', 'Buffet Sabor', 2800, 'Eventos', 'a0000000-0000-0000-0000-000000000001', 'Paga', '2026-12-01');
select status from invoices;
update invoices set status = 'Aprovada' where id = 'b0000000-0000-0000-0000-000000000001';
\echo '== 45b. Mesma nota duas vezes (espera ERRO)'
insert into invoices (number, supplier_name, value) values ('1234', 'buffet sabor', 2800);

\echo '== 46. Diretoria aprova a nota → pagamento agendado automaticamente'
select test_as('00000000-0000-0000-0000-0000000000f3');
select decide_invoice('b0000000-0000-0000-0000-000000000001', true);
select i.status, p.status as pagamento, p.value, p.due_date from invoices i join payments p on p.invoice_id = i.id;

\echo '== 47. Gestor registra o pagamento → nota Paga + despesa lançada'
select test_as('00000000-0000-0000-0000-0000000000f2');
update payments set status = 'Pago' where invoice_id = 'b0000000-0000-0000-0000-000000000001';
select (select status from invoices where id = 'b0000000-0000-0000-0000-000000000001') nota,
       (select count(*) from expenses where invoice_id = 'b0000000-0000-0000-0000-000000000001') despesas,
       (select total from expenses where invoice_id = 'b0000000-0000-0000-0000-000000000001') total;
\echo '== 47b. Gestor tenta estornar (espera ERRO; só aprovador)'
update payments set status = 'Agendado' where invoice_id = 'b0000000-0000-0000-0000-000000000001';
\echo '== 47c. Nota paga não pode ser cancelada (espera ERRO)'
update invoices set status = 'Cancelada' where id = 'b0000000-0000-0000-0000-000000000001';

\echo '== 48. Despesa manual + visão do orçamento (aprovado × comprometido × realizado)'
insert into expenses (description, budget_category, unit_value, quantity, expense_date) values ('Fotógrafo', 'Eventos', 600, 2, '2026-11-05');
select category, approved, committed, spent from budget_overview(2026) where category = 'Eventos';

\echo '== 49. Administrador estorna o pagamento → despesa vai para a lixeira, nota volta a Aprovada'
select test_as('00000000-0000-0000-0000-00000000000d');
update payments set status = 'Agendado' where invoice_id = 'b0000000-0000-0000-0000-000000000001';
select (select status from invoices where id = 'b0000000-0000-0000-0000-000000000001') nota,
       (select count(*) from expenses where invoice_id = 'b0000000-0000-0000-0000-000000000001' and deleted_at is null) despesas_ativas;

\echo '== 50. Colaborador não vê nada do Financeiro'
select test_as('00000000-0000-0000-0000-00000000000c');
select (select count(*) from invoices) notas, (select count(*) from purchase_requests) compras, (select count(*) from expenses) despesas;
select * from budget_overview(2026);
reset role;

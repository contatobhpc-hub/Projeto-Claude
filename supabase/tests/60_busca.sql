\echo '== 97. Busca global ignora acentos e maiúsculas e respeita a lixeira'
select test_as('00000000-0000-0000-0000-00000000000d');
insert into campaigns (name, products) values ('Consórcio — Busca Teste', '{Crédito Rural}');
select kind, label from global_search('CONSORCIO busca');
select count(*) as por_produto from global_search('credito rural') where label = 'Consórcio — Busca Teste';
update campaigns set deleted_at = now() where name = 'Consórcio — Busca Teste';
select count(*) as na_lixeira_nao_aparece from global_search('consorcio busca') where kind = 'campaigns';
select count(*) as termo_curto from global_search('c');
reset role;

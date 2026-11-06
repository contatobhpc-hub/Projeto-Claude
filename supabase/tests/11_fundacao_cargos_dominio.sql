set role authenticated;
select test_as('00000000-0000-0000-0000-00000000000d');  -- Davi, admin ativo neste ponto
\echo '== 16. Excluir cargo padrão (espera ERRO)'
delete from roles where key='gestor';
\echo '== 17. Criar cargo personalizado e excluir (espera OK, is_system=f)'
insert into roles (key, name, is_system) values ('agencia_x', 'Agência', true);
select key, is_system from roles where key='agencia_x';
delete from roles where key='agencia_x';
select count(*) as sobrou from roles where key='agencia_x';
\echo '== 18. Restringir domínio e tentar cadastro de fora (espera ERRO)'
update app_settings set value='{"allowed_domains":["sicoob.com.br"]}' where key='signup';
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'fora@gmail.com');
\echo '== 18b. Cadastro do domínio permitido (espera OK)'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'joao@SICOOB.com.br');
select email, active from profiles where id='00000000-0000-0000-0000-0000000000f2';
\echo '== 19. Histórico de cargos/configurações'
select table_name, action, count(*) from audit_log where table_name in ('roles','app_settings','role_permissions') group by 1,2 order by 1,2;

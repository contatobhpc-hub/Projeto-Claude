# Marketing Hub 2.0 — Sicoob Credibelo

Reconstrução do Marketing Hub com dados compartilhados pela equipe, cargos com
permissões aplicadas no banco e nenhuma cópia de dados no navegador.

Plano completo: documento "Marketing Hub 2.0 — Plano de reconstrução".

## O que já está pronto (Fase 1 — Fundação)

| Área | O que faz |
| --- | --- |
| Login | Entrar, criar conta, esqueci a senha, redefinir senha |
| Cadastro com aprovação | O primeiro usuário vira Administrador; os demais entram sem acesso até um Administrador liberar |
| Usuários | Liberar/desativar pessoas e trocar cargo; ninguém altera o próprio cargo; sempre resta 1 Administrador |
| Cargos e permissões | 5 cargos padrão + cargos novos; matriz editável (ver, criar, editar, excluir, aprovar, só atribuídos) |
| Histórico de alterações | Quem fez o quê e quando, com filtros |
| Lixeira | Excluídos ficam 30 dias; restaurar ou apagar de vez |
| Configurações | Nome da organização e domínios de e-mail aceitos no cadastro |
| Anexos e comentários | Componentes prontos para todos os módulos (`RecordAttachments`, `RecordComments`) |
| Menu por cargo | Cada pessoa só vê os módulos liberados; módulos das próximas fases aparecem como "em breve" |

## Como colocar no ar

1. **Supabase novo:** em supabase.com, crie o projeto. Em *SQL Editor*, rode o
   conteúdo de `supabase/migrations/20261106000001_fundacao.sql`.
   (Ou, com a CLI: `npx supabase link --project-ref <id>` e `npx supabase db push`.)
2. **Autenticação:** em *Authentication → URL Configuration*, coloque o endereço
   do app em *Site URL* e acrescente `<endereço>/redefinir-senha` em *Redirect URLs*.
3. **Variáveis:** copie `.env.example` para `.env` e preencha com *Project URL* e
   a chave *publishable/anon* (Project Settings → API). Nunca use a chave secreta aqui.
4. **Rodar:** `npm install` e `npm run dev`.
5. **Primeiro acesso:** crie sua conta pela tela de login. Por ser a primeira,
   ela já entra como Administrador. Depois peça à equipe para se cadastrar e
   libere cada pessoa em *Administração → Usuários*.

Para publicar, qualquer hospedagem que rode Vite/TanStack Start serve
(Cloudflare Pages, Vercel, Netlify), com as mesmas variáveis do passo 3.

## Como as permissões funcionam

- A matriz de cargos fica nas tabelas `roles` e `role_permissions`.
- As funções `has_perm(modulo, acao)` e `has_own_perm(modulo, acao)` são usadas
  pelas políticas RLS de todas as tabelas. Se alguém burlar a tela, o banco recusa.
- A interface lê `my_permissions()` só para esconder menus e botões.

### Padrão para novos módulos (Fases 2 a 5)

Toda tabela de módulo tem as colunas `id uuid`, `title` (ou outra coluna de
título), `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`
e, se tiver responsável, `assignee_id`. Depois de criá-la, uma linha liga tudo:

```sql
select public.register_module_table('public.campaigns', 'campanhas');
```

Isso aplica: autor e datas automáticos, histórico, lixeira com 30 dias e as
políticas de acesso da matriz. Nas telas, filtre `deleted_at is null` e, para
excluir, grave `deleted_at = now()` (o banco confere a permissão de exclusão).

## Testes do banco

`supabase/tests/run.sh` cria um banco descartável, aplica as migrações e roda
os cenários de permissão (19 casos: autopromoção, colaborador editando tarefa de
outro, analista excluindo, último administrador, domínio de cadastro etc.).
Rode-o sempre que mudar uma migração.

## Diferenças em relação ao app antigo

- Sem `localStorage` para dados: tudo vai direto ao banco e atualiza em tempo real.
- Uma tabela por assunto, com relações reais, em vez de blocos JSON.
- Dados da equipe, não de cada usuário.
- Arquivos salvos de verdade no Storage.

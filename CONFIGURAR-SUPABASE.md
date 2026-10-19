# Configurar o Supabase

O dashboard usa o cliente Supabase JS por CDN. O arquivo `supabase-config.js` contém a URL do projeto e uma chave publicável, apropriada para uso no navegador. **Nunca coloque uma secret key (`sb_secret_`) ou `service_role` no front-end.**

## Preparação inicial

1. No painel Supabase, abra **SQL Editor** e execute `supabase-schema.sql`. Para um banco já existente, execute também `supabase-migration-installment-anchor.sql`; ela apenas adiciona uma coluna opcional e preserva os registros atuais.
2. Em **Authentication → Users**, crie o usuário autorizado. Não habilite cadastro público.
3. Copie o UUID desse usuário e autorize-o no SQL Editor:

   ```sql
   insert into public.finance_access(user_id) values ('UUID-DO-USUARIO');
   ```

4. Sirva o site por HTTPS ou servidor local e entre com o usuário criado.
5. Em produção, inclua os endereços corretos em **Authentication → URL Configuration**.

## Perfis

O aplicativo oferece Dudu/Carlos e Paloma como perfis. No SQL atual, o usuário autorizado pode ler e editar os dois perfis. O seletor só organiza os dados na interface; não fornece isolamento de segurança entre as pessoas. Para permitir acesso independente ou confidencialidade entre perfis, será preciso redesenhar as políticas e a associação de usuários antes de usar esse modelo.

## Segurança operacional

- A chave publicável pode estar no cliente; a proteção dos dados vem de autenticação, autorização e políticas RLS.
- O SQL liga RLS nas tabelas. Revise as políticas no painel Supabase depois de executar o schema e não conceda acesso `anon` às tabelas financeiras.
- Como uma chave secreta foi compartilhada nesta conversa, revogue/rotacione-a no painel Supabase. O pacote GitHub não inclui essa chave.
- Configure URLs de redirecionamento para os domínios usados e use HTTPS.
- Guarde backups JSON em local privado e fora do repositório.
- O plano gratuito não deve ser tratado como backup automático garantido.
- Edições comuns agora aguardam a resposta do Supabase. Se a confirmação falhar, a interface restaura os dados locais anteriores e tenta reconciliar o banco; confirme os dados no Supabase depois de uma falha de conexão.
- A importação de backup faz upsert primeiro e remove registros excedentes depois, para reduzir o risco de apagar os dados atuais antes de verificar o arquivo. O Supabase não oferece uma transação única para essas chamadas do front-end; se a conexão cair no meio, confira o banco e reaplique o backup se necessário.
- A data da primeira parcela é sincronizada em `debts.first_due_date`. A migração adiciona essa coluna, mas não consegue recuperar datas históricas que nunca foram salvas; revise manualmente as datas antigas.

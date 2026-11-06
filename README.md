# OPERAÇÃO LACEN — versão inicial

Sistema web estático para GitHub Pages + Supabase.

## 1. Criar o projeto Supabase
Crie um projeto novo chamado `operacao-lacen`. No SQL Editor, execute todo o arquivo `schema.sql`.

## 2. Configurar o administrador
1. No Supabase, abra Authentication > Users e crie o usuário administrador (e-mail e senha).
2. Copie o UUID desse usuário.
3. No SQL Editor, execute, substituindo pelo UUID real:

```sql
insert into public.admins(user_id)
values ('COLE-AQUI-O-UUID-DO-USUARIO');
```

## 3. Configurar o site
Em Project Settings > API, copie Project URL e anon/public key.
Cole os dois valores no arquivo `config.js`. Não use a `service_role` key no site.

## 4. Publicar no GitHub Pages
1. Crie um repositório público chamado `operacao-lacen`.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Em Settings > Pages, escolha Deploy from a branch, branch `main`, pasta `/root`.
4. O endereço será semelhante a `https://SEU-USUARIO.github.io/operacao-lacen/`.
5. A tela da equipe fica em `/` e o painel administrativo em `/admin.html`.

## 5. Senhas iniciais das equipes
Distribua uma senha individual para cada equipe. As senhas abaixo são temporárias e devem ser alteradas antes do evento:

| Equipe | Senha inicial |
|---|---:|
| 1 | 731842 |
| 2 | 284619 |
| 3 | 965173 |
| 4 | 417528 |
| 5 | 852396 |
| 6 | 693741 |
| 7 | 528164 |

Para alterar uma senha, gere o hash no próprio banco. Exemplo para a Equipe 1:

```sql
update public.teams
set pin_hash = crypt('NOVA-SENHA', gen_salt('bf'))
where id = 1;
```

## 6. Pontuação desta versão
- Código de estação concluída: 100 pontos.
- Código de estação não concluída: 0 ponto.
- Cada equipe pode registrar apenas um resultado por estação.
- Os códigos são validados no banco e armazenados como hash.
- O painel administrativo exige login Supabase e autorização na tabela `admins`.

## Observações importantes
- O sistema ainda não implementa dicas, ajuda dos universitários, benefícios, penalidades, ajuste de pontuação, bloqueio de estações ou encerramento administrativo. Essas regras precisam ser definidas antes da próxima etapa.
- Esta versão inicial usa pontuação fixa de 100/0, conforme resultado do código. Podemos ajustar para o modelo de peso/contrapeso do regulamento.
- O sistema não foi conectado ao seu projeto Supabase nem publicado no GitHub: isso depende de você criar o projeto e inserir as credenciais nos arquivos.
- Antes do evento, teste com uma equipe fictícia e valide todos os 14 códigos.

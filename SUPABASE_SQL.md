# SQL para Supabase — Casca e Motor

Cole cada seção abaixo no **SQL Editor** do Supabase (projeto solara-os).

## 1. Tabela `execucoes_agentes`

```sql
create table execucoes_agentes (
  id uuid default gen_random_uuid() primary key,
  area text not null,
  item_tipo text not null,
  item_id text not null,
  agente text not null,
  chamado_por uuid references execucoes_agentes(id) on delete cascade,
  status text not null default 'rodando',
  entrada jsonb,
  saida jsonb,
  erro text,
  tokens_entrada int,
  tokens_saida int,
  inicio timestamptz default now(),
  fim timestamptz,
  criado_em timestamptz default now()
);

create index idx_execucoes_item on execucoes_agentes(item_id);
create index idx_execucoes_area on execucoes_agentes(area);
create index idx_execucoes_chamado_por on execucoes_agentes(chamado_por);

alter publication supabase_realtime add table execucoes_agentes;
```

## 2. Tabela `aprovacoes`

```sql
create table aprovacoes (
  id uuid default gen_random_uuid() primary key,
  area text not null,
  item_tipo text not null,
  item_id text not null,
  titulo text not null,
  proposta jsonb,
  status text not null default 'pendente',
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz,
  observacao text,
  criado_em timestamptz default now()
);

create index idx_aprovacoes_status on aprovacoes(status);
create index idx_aprovacoes_area on aprovacoes(area);
create index idx_aprovacoes_item on aprovacoes(item_id);

alter publication supabase_realtime add table aprovacoes;
```

## Próximas instruções

1. **Copie e cole o SQL 1** no Supabase
2. **Copie e cole o SQL 2** no Supabase
3. **Crie um usuário admin** no painel Auth do Supabase (e-mail + senha)
4. **No painel Supabase**, tabela `perfis`, crie uma linha com:
   - `id`: (copie o ID do usuário criado em Auth)
   - `email`: e-mail do admin
   - `nome`: seu nome
   - `papel`: `admin`
   - `areas`: `{vendas, financeiro}` (ou array JSON)

5. Agora pode testar:
   - `npm run dev`
   - Acesse http://localhost:3000/login
   - Use as credenciais do usuário criado

---

**Tabela de configuração do Supabase:**

| Entidade | O que é | Criado em | Status |
|----------|---------|----------|--------|
| `perfis` | Usuarios e permissões | CLAUDE.md | ✅ Já existe |
| `execucoes_agentes` | Log de execuções | Este arquivo | ⏳ Aguarda SQL |
| `aprovacoes` | Fila de aprovação | Este arquivo | ⏳ Aguarda SQL |


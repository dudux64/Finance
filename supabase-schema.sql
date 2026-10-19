-- Finança: conta Supabase compartilhada com seletor de perfis no aplicativo.
-- Aplique no SQL Editor do projeto novo. Este arquivo é idempotente para tabelas e políticas.

create table if not exists public.finance_profiles (
  id text primary key check (id in ('carlos','paloma')),
  display_name text not null,
  created_at timestamptz not null default now()
);
insert into public.finance_profiles(id,display_name) values
  ('carlos','Carlos'),('paloma','Paloma')
on conflict(id) do update set display_name=excluded.display_name;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.finance_profiles(id),
  type text not null check(type in ('receita','despesa')),
  status text not null check(status in ('pago','pendente')),
  description text not null,
  amount numeric(14,2) not null check(amount>=0),
  category text,
  transaction_date date not null,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.finance_profiles(id),
  name text not null,
  total_amount numeric(14,2) not null check(total_amount>=0),
  installment_amount numeric(14,2) not null check(installment_amount>=0),
  total_installments integer not null check(total_installments>0),
  paid_installments integer not null default 0 check(paid_installments>=0),
  due_date date not null,
  created_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.finance_profiles(id),
  name text not null,
  amount numeric(14,2) not null check(amount>=0),
  period text not null check(period in ('mensal','trimestral','semestral','anual')),
  next_date date not null,
  status text not null check(status in ('ativa','pausada','cancelada')),
  created_at timestamptz not null default now()
);

alter table public.finance_profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.debts enable row level security;
alter table public.subscriptions enable row level security;
create schema if not exists private;
create table if not exists public.finance_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.finance_access enable row level security;
revoke all on public.finance_access from anon,authenticated;
create or replace function private.can_use_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.finance_access where user_id=(select auth.uid()));
$$;
revoke execute on function private.can_use_finance() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.can_use_finance() to authenticated;
revoke all on public.finance_profiles,public.transactions,public.debts,public.subscriptions from anon;
grant select on public.finance_profiles to authenticated;
grant select,insert,update,delete on public.transactions,public.debts,public.subscriptions to authenticated;

drop policy if exists finance_profiles_authenticated_read on public.finance_profiles;
create policy finance_profiles_authenticated_read on public.finance_profiles for select to authenticated using ((select private.can_use_finance()));
drop policy if exists transactions_authenticated_all on public.transactions;
create policy transactions_authenticated_all on public.transactions for all to authenticated using ((select private.can_use_finance())) with check ((select private.can_use_finance()));
drop policy if exists debts_authenticated_all on public.debts;
create policy debts_authenticated_all on public.debts for all to authenticated using ((select private.can_use_finance())) with check ((select private.can_use_finance()));
drop policy if exists subscriptions_authenticated_all on public.subscriptions;
create policy subscriptions_authenticated_all on public.subscriptions for all to authenticated using ((select private.can_use_finance())) with check ((select private.can_use_finance()));

create index if not exists transactions_profile_date_idx on public.transactions(profile_id,transaction_date desc);
create index if not exists debts_profile_due_idx on public.debts(profile_id,due_date);
create index if not exists subscriptions_profile_next_idx on public.subscriptions(profile_id,next_date);

-- SETUP: depois de criar a conta de login em Authentication > Users, copie o UUID dela
-- e execute uma vez, substituindo o marcador:
-- insert into public.finance_access(user_id) values ('UUID-DO-USUARIO-AUTORIZADO');

-- Âncora para reconstruir o calendário mensal das parcelas. Seguro executar em banco já existente.
alter table public.debts add column if not exists first_due_date date;

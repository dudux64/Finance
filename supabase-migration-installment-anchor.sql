-- Adiciona a data da primeira parcela sem alterar nem apagar os registros existentes.
alter table public.debts add column if not exists first_due_date date;

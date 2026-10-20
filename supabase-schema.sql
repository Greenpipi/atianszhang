-- 财务管家 · Supabase 建表脚本（含行级安全 RLS，按用户隔离）
-- 在 Supabase 控制台 → SQL Editor → New query 中粘贴并运行

create table if not exists ledgers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'personal',
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references ledgers(id) on delete cascade,
  name text not null,
  kind text not null default 'expense',
  subs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references ledgers(id) on delete cascade,
  category text not null default '',
  sub text not null default '',
  amount numeric not null default 0,
  note text not null default '',
  favorite boolean not null default false,
  rating integer not null default 0,
  date text not null default '',
  image text,
  kind text not null default 'expense',
  created_at timestamptz not null default now()
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references ledgers(id) on delete cascade,
  category text not null default '',
  sub text not null default '',
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null references ledgers(id) on delete cascade,
  category text not null default '',
  sub text not null default '',
  created_at timestamptz not null default now()
);

-- 行级安全：每个用户只能读写自己的数据
alter table ledgers    enable row level security;
alter table categories enable row level security;
alter table records    enable row level security;
alter table budgets    enable row level security;
alter table templates  enable row level security;

drop policy if exists "own ledgers" on ledgers;
create policy "own ledgers" on ledgers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own categories" on categories;
create policy "own categories" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own records" on records;
create policy "own records" on records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own budgets" on budgets;
create policy "own budgets" on budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own templates" on templates;
create policy "own templates" on templates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 实时同步（多设备一致）
alter publication supabase_realtime add table ledgers;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table records;
alter publication supabase_realtime add table budgets;
alter publication supabase_realtime add table templates;
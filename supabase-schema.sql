-- ============================================================
-- 财务管家 · Supabase 建表脚本（单语句兼容版）
-- 你的项目执行通道一次只接受一条 SQL（多语句报 Only singular query allowed）
-- 因此分两步运行，每步都是单条语句：
--
--   第 1 步：把本文件全部内容粘贴进 SQL Editor，点 Run（无输出即成功）
--   第 2 步：新建查询，粘贴下面这一行，点 Run，看到 done 即建表成功
--       select public.setup_finance_tables();
--
-- ============================================================
create or replace function public.setup_finance_tables() returns text
language plpgsql
as $fn$
begin
  execute $ddl$ create table if not exists ledgers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    type text not null default 'personal',
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    name text not null,
    kind text not null default 'expense',
    subs jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists records (
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
  ) $ddl$;

  execute $ddl$ create table if not exists budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    amount numeric not null default 0,
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  -- 行级安全：每个用户只能读写自己的数据
  execute $ddl$ alter table ledgers    enable row level security $ddl$;
  execute $ddl$ alter table categories enable row level security $ddl$;
  execute $ddl$ alter table records    enable row level security $ddl$;
  execute $ddl$ alter table budgets    enable row level security $ddl$;
  execute $ddl$ alter table templates  enable row level security $ddl$;

  execute $ddl$ drop policy if exists "own ledgers" on ledgers $ddl$;
  execute $ddl$ create policy "own ledgers" on ledgers for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own categories" on categories $ddl$;
  execute $ddl$ create policy "own categories" on categories for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own records" on records $ddl$;
  execute $ddl$ create policy "own records" on records for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own budgets" on budgets $ddl$;
  execute $ddl$ create policy "own budgets" on budgets for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  execute $ddl$ drop policy if exists "own templates" on templates $ddl$;
  execute $ddl$ create policy "own templates" on templates for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  return 'done：5 张表已创建，RLS 已启用。可到 Database > Replication 开启实时同步。';
end
$fn$;

-- ============================================================
-- 财务管家 · Supabase 建表脚本（单语句兼容版）
-- 你的项目执行通道一次只接受一条 SQL（多语句报 Only singular query allowed）
-- 因此分两步运行，每步都是单条语句：
--
--   第 1 步：把本文件全部内容粘贴进 SQL Editor，点 Run（无输出即成功）
--   第 2 步：新建查询，粘贴下面这一行，点 Run，看到 done 即建表成功
--       select public.setup_finance_tables();
--
-- 幂等安全：重复执行不会报错，只会补齐缺失的表/列/策略。
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
    kind text not null default '',
    icon text not null default '',
    color text not null default '',
    sort integer not null default 0,
    archived boolean not null default false,
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    name text not null,
    kind text not null default 'expense',
    subs jsonb not null default '[]'::jsonb,
    icon text not null default '',
    sort integer not null default 0,
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
    status text not null default '',
    images text[] not null default '{}'::text[],
    purchase_platform text not null default '',
    attribute text not null default '',
    status_since text not null default '',
    remark text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    amount numeric not null default 0,
    month text not null default '',
    note text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  execute $ddl$ create table if not exists templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    ledger_id uuid not null references ledgers(id) on delete cascade,
    category text not null default '',
    sub text not null default '',
    label text not null default '',
    section text not null default '',
    emoji text not null default '',
    created_at timestamptz not null default now()
  ) $ddl$;

  -- 顶部横幅配置（每用户一行，banner 图 + 位置）
  execute $ddl$ create table if not exists banners (
    user_id uuid primary key references auth.users(id) on delete cascade,
    img text not null default '',
    pos_x double precision not null default 50,
    pos_y double precision not null default 30,
    updated_at timestamptz not null default now()
  ) $ddl$;

  -- 账单标签列（多选标签，文本数组）
  execute $ddl$ alter table records add column if not exists tags text[] not null default '{}'::text[] $ddl$;

  -- 好物使用状态（使用中/闲置中/未使用/已弃用，存中文 label）
  execute $ddl$ alter table records add column if not exists status text not null default '' $ddl$;

  -- 好物多图（images 优先，兼容老数据单图 image 列）
  execute $ddl$ alter table records add column if not exists images text[] not null default '{}'::text[] $ddl$;

  -- 好物购买平台 / 属性 / 弃用冻结日（弃用后陪伴天数冻结在弃用当日）
  execute $ddl$ alter table records add column if not exists purchase_platform text not null default '' $ddl$;
  execute $ddl$ alter table records add column if not exists attribute text not null default '' $ddl$;
  execute $ddl$ alter table records add column if not exists status_since text not null default '' $ddl$;

  -- 编辑弹窗「备注」多行文本框（与 note/描述 分开）
  execute $ddl$ alter table records add column if not exists remark text not null default '' $ddl$;

  -- 老表补列（create table if not exists 不会给已存在的表加列，这里逐列补齐，幂等）
  execute $ddl$ alter table ledgers    add column if not exists kind     text         not null default '' $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists icon     text         not null default '' $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists color    text         not null default '' $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists sort     integer      not null default 0 $ddl$;
  execute $ddl$ alter table ledgers    add column if not exists archived boolean     not null default false $ddl$;
  execute $ddl$ alter table categories add column if not exists icon     text         not null default '' $ddl$;
  execute $ddl$ alter table categories add column if not exists sort     integer      not null default 0 $ddl$;
  execute $ddl$ alter table templates  add column if not exists label    text         not null default '' $ddl$;
  execute $ddl$ alter table templates  add column if not exists section  text         not null default '' $ddl$;
  execute $ddl$ alter table templates  add column if not exists emoji    text         not null default '' $ddl$;
  execute $ddl$ alter table budgets    add column if not exists month    text         not null default '' $ddl$;
  execute $ddl$ alter table budgets    add column if not exists note     text         not null default '' $ddl$;

  -- 行级安全：每个用户只能读写自己的数据
  execute $ddl$ alter table ledgers    enable row level security $ddl$;
  execute $ddl$ alter table categories enable row level security $ddl$;
  execute $ddl$ alter table records    enable row level security $ddl$;
  execute $ddl$ alter table budgets    enable row level security $ddl$;
  execute $ddl$ alter table templates  enable row level security $ddl$;
  execute $ddl$ alter table banners    enable row level security $ddl$;

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

  execute $ddl$ drop policy if exists "own banners" on banners $ddl$;
  execute $ddl$ create policy "own banners" on banners for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id) $ddl$;

  return 'done：6 张表已创建（含 banners），records.tags 列与 templates/ledgers 等全部所需列已补齐，RLS 已启用。可到 Database > Replication 开启实时同步。';
end
$fn$;

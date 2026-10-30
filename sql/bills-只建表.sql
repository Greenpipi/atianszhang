-- ============================================================
-- 「周期性待办账单」最小建表脚本（幂等，可重复执行）
-- 用途：如果不想整份重跑 supabase-schema.sql，只跑这段即可
-- 位置：Supabase Dashboard → SQL Editor → 粘贴 → Run
-- ============================================================

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  cat text not null default '',
  sub text not null default '',
  btype text not null default '',
  custom_type text not null default '',
  cycle text not null default 'monthly',
  cycle_months integer not null default 1,
  due_day integer not null default 1,
  due_month integer not null default 1,
  remind_time text not null default '09:00',
  start_date text not null default '',
  end_mode text not null default 'never',
  end_date text not null default '',
  preset_amount numeric,
  paused boolean not null default false,
  paid_period text not null default '',
  paid_amount numeric,
  paid_record_id uuid,
  paid_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists bills_user_idx on bills (user_id, created_at);

alter table bills enable row level security;

drop policy if exists "own bills" on bills;
create policy "own bills" on bills for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- （可选）把 bills 加入实时同步；已加入时静默跳过，不影响执行
do $$
begin
  alter publication supabase_realtime add table bills;
exception when duplicate_object then null;
end $$;

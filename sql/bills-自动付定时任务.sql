-- ============================================================
-- 待办账单「自动付」服务端定时结算（幂等，可重复执行）
-- 位置：Supabase Dashboard → SQL Editor → 粘贴 → Run
--
-- 作用：每天 00:10 UTC（北京/新加坡时间 08:10）扫描当天及之前应付款的 auto 账单，
--       用预设金额写入 records 并把账单标记为已支付，自动推进到下一期。
-- 前端也会在打开应用时补算一次，两边靠 paid_period 原子认领，不会重复入账。
--
-- 注意：函数使用账单上次入账的账本 / 用户第一个账本，大类优先账单自选，其次「固定支出」。
-- ============================================================

-- 1) 到期日推算：与 js/data.js 的 billOccurrence 完全一致的算法
create or replace function public.bill_occurrence(
  p_start text, p_cycle text, p_every int, p_due_day int, p_due_month int, k int
) returns date
language plpgsql immutable as $$
declare
  v_start date := coalesce(nullif(p_start, ''), to_char(current_date, 'YYYY-MM-DD'))::date;
  v_sy int := extract(year  from v_start)::int;
  v_sm int := extract(month from v_start)::int;
  v_total int;
  v_y int;
  v_m int;
  v_dim int;
begin
  if p_cycle = 'yearly' then
    v_y := v_sy + k;
    v_m := coalesce(nullif(p_due_month, 0), v_sm);
  else
    v_total := (v_sm - 1) + k * greatest(1, coalesce(p_every, 1));
    v_y := v_sy + floor(v_total / 12.0)::int;
    v_m := (v_total % 12) + 1;
  end if;
  -- 月末保底：31 号在 2 月自动落到 28/29 号
  v_dim := extract(day from (make_date(v_y, v_m, 1) + interval '1 month' - interval '1 day'))::int;
  return make_date(v_y, v_m, least(greatest(1, coalesce(p_due_day, 1)), v_dim));
end $$;

-- 2) 扫描并结算所有到期未付的自动付账单，返回结算笔数
create or replace function public.bill_auto_settle() returns integer
language plpgsql security definer set search_path = public as $$
declare
  b        record;
  k        int;
  v_every  int;
  v_lid    uuid;
  v_cat    text;
  v_sub    text;
  v_occ    date;
  v_rid    uuid;
  v_claim  uuid;
  v_n      int := 0;
begin
  for b in
    select * from public.bills
     where payment_method = 'auto'
       and paused = false
       and coalesce(preset_amount, 0) > 0
  loop
    -- 已过结束日期：不再结算
    if b.end_mode = 'date' and coalesce(b.end_date, '') <> ''
       and current_date > b.end_date::date then
      continue;
    end if;

    -- 账本：优先沿用上一期入账的账本，其次该用户第一个未归档账本
    v_lid := (select r.ledger_id from public.records r where r.id = b.paid_record_id);
    if v_lid is null then
      v_lid := (select l.id from public.ledgers l
                 where l.user_id = b.user_id and l.archived = false
                 order by l.sort, l.created_at limit 1);
    end if;
    if v_lid is null then continue; end if;

    v_every := case b.cycle
                 when 'yearly'     then 12
                 when 'custom'     then greatest(1, coalesce(b.cycle_months, 1))
                 when 'quarterly'  then 3
                 when 'semiannual' then 6
                 else 1
               end;

    -- 大类：账单自己选的 → 「固定支出」→ 该账本第一个分类
    v_cat := null;
    if coalesce(b.cat, '') <> '' then
      select c.name into v_cat from public.categories c
       where c.ledger_id = v_lid and c.name = b.cat limit 1;
    end if;
    if v_cat is null then
      select c.name into v_cat from public.categories c
       where c.ledger_id = v_lid and c.name = '固定支出' limit 1;
    end if;
    if v_cat is null then
      select c.name into v_cat from public.categories c
       where c.ledger_id = v_lid order by c.sort, c.created_at limit 1;
    end if;
    v_cat := coalesce(v_cat, nullif(b.cat, ''), '固定支出');
    v_sub := coalesce(nullif(b.sub, ''), nullif(b.btype, ''), nullif(b.name, ''), '固定支出');

    -- 从第 0 期枚举到当天，逐期结算（漏了几个月会一起补上）
    for k in 0..600 loop
      v_occ := public.bill_occurrence(
                 coalesce(nullif(b.start_date, ''), to_char(current_date, 'YYYY-MM-DD')),
                 b.cycle, v_every, b.due_day, b.due_month, k);
      exit when v_occ > current_date;
      -- 年报账单的「每年几月」可能早于开始日期的月份，这类期次不算数
      if coalesce(nullif(b.start_date, ''), '') <> '' and v_occ < b.start_date::date then
        continue;
      end if;
      -- 不回溯创建日之前的期次：新建自动付账单不会立刻补扣旧账
      -- 与前端 billAutoFloor 对齐：都按用户所在时区（Asia/Shanghai）取创建日
      if v_occ < (b.created_at at time zone 'Asia/Shanghai')::date then
        continue;
      end if;
      -- 已付的期次直接跳过（字符串日期可直接比较大小）
      if v_occ > coalesce(nullif(b.paid_period, ''), '1900-01-01')::date then
        v_claim := null;
        update public.bills
           set paid_period = v_occ::text,
               paid_amount = b.preset_amount,
               paid_by     = 'auto',
               paid_at     = now()
         where id = b.id and paid_period < v_occ::text
         returning id into v_claim;
        exit when v_claim is null;   -- 被前端抢先认领

        insert into public.records (user_id, ledger_id, category, sub, amount, note, date, kind, favorite, rating)
        values (b.user_id, v_lid, v_cat, v_sub, b.preset_amount,
                '周期性账单：' || b.name || '（自动扣款）', v_occ::text, 'expense', false, 0)
        returning id into v_rid;

        update public.bills set paid_record_id = v_rid where id = b.id;
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;

revoke all on function public.bill_auto_settle() from public, anon, authenticated;

-- 3) 每天 00:10 UTC 跑一次（北京/新加坡时间 08:10）
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'bill-auto-settle') then
      perform cron.unschedule('bill-auto-settle');
    end if;
    perform cron.schedule('bill-auto-settle', '10 0 * * *', 'select public.bill_auto_settle();');
  end if;
end $$;

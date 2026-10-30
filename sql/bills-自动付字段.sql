-- ============================================================
-- 待办账单「自动付」：新增付款方式字段（幂等，可重复执行）
-- 位置：Supabase Dashboard → SQL Editor → 粘贴 → Run
-- 说明：payment_method = manual（手动付）/ auto（自动付·代扣）
--       paid_by 记录这一期实际是手动确认还是自动扣款入账，用于「已自动支付」通知与金额修正
-- ============================================================

alter table public.bills add column if not exists payment_method text not null default 'manual';
alter table public.bills add column if not exists paid_by text not null default '';

-- 定时任务按「自动付 + 未暂停 + 有预设金额」扫描，加个部分索引
create index if not exists bills_auto_due_idx
  on public.bills (user_id, due_day)
  where payment_method = 'auto' and paused = false;

-- 说明：RLS 策略 own bills（cmd = ALL）已覆盖新列，无需新增策略；
-- 定时任务函数以 owner 身份运行，会自行按 user_id 过滤，不受 RLS 影响

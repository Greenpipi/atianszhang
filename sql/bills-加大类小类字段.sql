-- ============================================================
-- 给已存在的 bills 表补「大类 / 小类」两个字段（幂等，可重复执行）
-- 用途：账单从「单一类型」改成「大类 + 小类」后需要这两列
-- 位置：Supabase Dashboard → SQL Editor → 粘贴 → Run
-- 不执行也能用：这两列写不进去时应用会自动跳过，只是分类回落为「固定支出」
-- ============================================================

alter table bills add column if not exists cat text not null default '';
alter table bills add column if not exists sub text not null default '';

-- 老账单没有 cat/sub，按类型名回填一次，这样年度总览和入账归属立刻正确
update bills
   set sub = case when btype = '自定义' and custom_type <> '' then custom_type else btype end
 where (sub = '' or sub is null)
   and (btype <> '' or custom_type <> '');
update bills set cat = '固定支出' where (cat = '' or cat is null) and sub <> '';

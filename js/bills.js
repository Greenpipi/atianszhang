/* ============ 周期性待办账单：渲染 / 交互 ============
 * 依赖 app.js 的 App（弹窗、toast、日历、自定义下拉）与 data.js 的纯计算。
 * 数据存独立 bills 表；仅「已付」时写入 records 并回填 paid_record_id。
 * 本文件在 app.js 之后以 defer 加载，用 Object.assign 挂到 App 上。
 */
(function () {
  'use strict';

  const state = () => App.state;
  const billList = () => (App.state.bills || []);
  const amountText = b => (Number(b.preset_amount) > 0 ? fmtMoney(Number(b.preset_amount)) : '<span class="bill-amt-none">未设金额</span>');

  Object.assign(App, {

    /* ---------- 页面渲染 ---------- */
    renderBills() {
      const el = document.getElementById('view-bills');
      if (!el) return;
      const today = todayStr();
      const bills = billList().slice();
      const tab = this.state.billsTab || 'due';
      const rows = bills.map(b => ({ b, st: billStatus(b, today) }));

      const dueRows = rows.filter(r => r.st.state === 'overdue' || billDueThisMonth(r.b, today));
      const overdueRows = rows.filter(r => r.st.state === 'overdue');
      const monthAmount = dueRows.reduce((s, r) => s + (Number(r.b.preset_amount) || 0), 0);
      const activeCount = rows.filter(r => !r.st.paused && !r.st.ended).length;
      const year = String(new Date().getFullYear());
      const yearRows = billYearOverview(bills, year);
      const yearTotal = yearRows.reduce((s, x) => s + x.amount, 0);
      const missing = Store.mode === 'supabase' && Store.billsMissing;

      const rank = st => st.state === 'overdue' ? 0 : st.state === 'pending' ? 1 : st.state === 'upcoming' ? 2 : st.state === 'paid' ? 3 : st.state === 'paused' ? 4 : 5;
      const listRows = (tab === 'due' ? dueRows : rows.slice()).sort((a, b) => {
        const dr = rank(a.st) - rank(b.st);
        if (dr) return dr;
        const da = a.st.dueDate || a.st.nextDate || '9999-12-31';
        const db = b.st.dueDate || b.st.nextDate || '9999-12-31';
        return da < db ? -1 : da > db ? 1 : 0;
      });

      el.innerHTML = `
        <div class="bills-head">
          <div class="scope-seg" id="bills-tabs">
            <button type="button" data-tab="due" class="${tab === 'due' ? 'on' : ''}">本月待付</button>
            <button type="button" data-tab="all" class="${tab === 'all' ? 'on' : ''}">全部待办</button>
            <button type="button" data-tab="overview" class="${tab === 'overview' ? 'on' : ''}">今年总览</button>
          </div>
          <button class="btn btn-primary" id="bill-add" ${missing ? 'disabled' : ''}>＋ 添加待办账单</button>
        </div>
        ${missing ? '<div class="bills-notice">云端尚未创建待办账单数据表。请到「设置 → 云端同步」重新执行建表 SQL（已新增 bills 表）后刷新；账册功能不受影响。</div>' : ''}
        <div class="grid grid-4" style="margin-bottom:18px">
          <div class="stat-card"><div class="stat-label">本月待付</div><div class="stat-value expense">${fmtMoney(monthAmount)}</div><div class="stat-foot">${dueRows.length} 笔待处理</div></div>
          <div class="stat-card"><div class="stat-label">逾期未处理</div><div class="stat-value" style="color:${overdueRows.length ? 'var(--danger)' : 'var(--text)'}">${overdueRows.length}</div><div class="stat-foot">${overdueRows.length ? '请尽快确认支付' : '暂无逾期'}</div></div>
          <div class="stat-card"><div class="stat-label">${year} 年固定支出预计</div><div class="stat-value">${fmtMoney(yearTotal)}</div><div class="stat-foot">共 ${yearRows.reduce((s, x) => s + x.count, 0)} 期</div></div>
          <div class="stat-card"><div class="stat-label">启用中账单</div><div class="stat-value">${activeCount}</div><div class="stat-foot">共 ${rows.length} 条待办</div></div>
        </div>
        <div id="bills-body"></div>`;

      const body = el.querySelector('#bills-body');
      if (tab === 'overview') {
        body.innerHTML = this.billOverviewHTML(yearRows, year, yearTotal);
      } else if (listRows.length) {
        body.innerHTML = '<div class="bill-list">' + listRows.map(r => this.billCardHTML(r.b, r.st)).join('') + '</div>';
      } else {
        body.innerHTML = `<div class="card"><div class="empty"><p>${tab === 'due' ? '本月没有待付账单，轻松一下 🎉' : '还没有待办账单，点右上角「添加待办账单」创建第一条'}</p></div></div>`;
      }

      el.querySelectorAll('#bills-tabs [data-tab]').forEach(btn => {
        btn.onclick = () => { this.state.billsTab = btn.dataset.tab; this.renderBills(); };
      });
      const add = el.querySelector('#bill-add');
      if (add) add.onclick = () => this.openBillModal();
      body.querySelectorAll('[data-bill-act]').forEach(btn => {
        const id = btn.dataset.bid, act = btn.dataset.billAct;
        btn.onclick = () => {
          if (act === 'pay') this.payBill(id);
          else if (act === 'edit') this.openBillModal(id);
          else if (act === 'pause') this.toggleBillPause(id);
          else if (act === 'del') this.deleteBill(id);
        };
      });
      this.enhanceSelects(el);
      if (this.updateBillsBadge) this.updateBillsBadge();
    },

    billCardHTML(b, st) {
      const meta = st.meta;
      const amt = Number(b.preset_amount);
      let dueLine = '';
      if (st.paused) {
        dueLine = billDueText(b) + ' · 已暂停';
      } else if (st.ended) {
        dueLine = billDueText(b) + ' · 已结束';
      } else if (st.state === 'paid') {
        dueLine = '本期已支付' + (Number(b.paid_amount) > 0 ? ' ' + fmtMoney(Number(b.paid_amount)) : '') + (st.dueDate ? ' · ' + billDateText(st.dueDate) : '') + (st.nextDate ? ' · 下次 ' + billDateText(st.nextDate) : '');
      } else if (st.dueDate) {
        const d = st.daysSince;
        if (d != null && d > 0) dueLine = '应于 ' + billDateText(st.dueDate) + ' 支付' + (d > 3 ? ' · 已逾期 ' + d + ' 天' : '');
        else if (d === 0) dueLine = '今天到期 · 请确认是否已付';
        else if (st.daysTo != null) {
          // 剩余 ≤3 天时倒计时标红，提醒尽快处理
          const urgent = st.daysTo <= 3;
          dueLine = billDateText(st.dueDate) + ' 到期<span class="bill-countdown' + (urgent ? ' red' : '') + '">（' + st.daysTo + ' 天后）</span>';
        } else dueLine = billDateText(st.dueDate) + ' 到期';
      }
      const canPay = !st.paused && !st.ended && !st.paid && !!st.dueDate;
      return `
      <div class="bill-card ${st.cls}">
        <div class="bill-ico" style="background:${meta.color}1F;color:${meta.color}">${meta.emoji}</div>
        <div class="bill-main">
          <div class="bill-name">${esc(b.name || st.displayName)}
            <span class="badge badge-${st.cls}">${esc(st.label)}</span>
            ${st.state === 'paid' && b.paid_record_id ? '<span class="badge badge-green">已入账</span>' : ''}
            ${b.paused ? '<span class="badge badge-gray">已暂停</span>' : ''}
          </div>
          <div class="bill-meta">${esc(billDueText(b))}</div>
          <div class="bill-meta">${esc(dueLine)}</div>
        </div>
        <div class="bill-amount">${amountText(b)}<span class="sub">${amt > 0 ? '预设金额' : '每期填写'}</span></div>
        <div class="bill-acts">
          ${canPay ? '<button class="btn btn-primary btn-sm" data-bill-act="pay" data-bid="' + b.id + '">已付</button>' : ''}
          <button class="btn btn-ghost btn-sm" data-bill-act="edit" data-bid="${b.id}">编辑</button>
          <button class="btn btn-ghost btn-sm" data-bill-act="pause" data-bid="${b.id}">${b.paused ? '启用' : '暂停'}</button>
          <button class="btn btn-danger btn-sm" data-bill-act="del" data-bid="${b.id}">删除</button>
        </div>
      </div>`;
    },

    billOverviewHTML(yearRows, year, total) {
      const rows = yearRows.map(r => `
        <tr>
          <td>${esc(r.name)}</td>
          <td class="num">${r.count}</td>
          <td class="num">${r.hasAmount ? fmtMoney(r.amount / r.count, { plain: true }) : '<span style="color:var(--muted)">未设</span>'}</td>
          <td class="num"><b>${r.hasAmount ? fmtMoney(r.amount) : '—'}</b></td>
        </tr>`).join('');
      return `
      <div class="card">
        <div class="card-head">
          <div><div class="card-title">${year} 年固定支出总览</div><div class="card-sub">按账单类型统计全年预计支出（不含已暂停/已结束）</div></div>
          <span class="badge badge-purple">合计 ${fmtMoney(total)}</span>
        </div>
        <div style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>账单类型</th><th class="num">全年期数</th><th class="num">单期金额</th><th class="num">全年预计</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:30px">今年还没有可统计的待办账单</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    },

    /* ---------- 新增 / 编辑 ---------- */
    openBillModal(billId) {
      if (Store.mode === 'supabase' && Store.billsMissing) {
        this.toast('请先在「设置」执行最新建表 SQL（新增 bills 表）');
        return;
      }
      const b = billId ? billList().find(x => x.id === billId) : null;
      const d = b || {
        name: '', cat: '', sub: '', cycle: 'monthly', cycle_months: 1,
        due_day: 15, due_month: new Date().getMonth() + 1,
        start_date: todayStr(), end_mode: 'never', end_date: '', preset_amount: null, note: ''
      };
      const isYearly = d.cycle === 'yearly';
      const isCustomCycle = d.cycle === 'custom';
      // 大类 / 小类：与「新增记账」完全一致（大类来自账本分类，小类取该大类下的子类）
      const ledgerId = this.state.currentLedgerId || ((this.state.ledgers || [])[0] || {}).id;
      const cats = this.catsOf(ledgerId);
      const defCat = (d.cat && cats.some(c => c.name === d.cat)) ? d.cat
        : (cats.some(c => c.name === '固定支出') ? '固定支出' : ((cats[0] || {}).name || ''));
      const catOpts = cats.map(c => `<option value="${esc(c.name)}" ${defCat === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
      const subsOf = name => {
        const c = this.catByName(ledgerId, name);
        const list = ((c && c.subs) || []).slice();
        // 合并 10 种预设类型，保证还没建过小类时也能直接选到房贷 / 水电燃气等
        BILL_TYPES.forEach(t => { if (!list.includes(t.name)) list.push(t.name); });
        return list;
      };
      const firstSubs = subsOf(defCat);
      const defSub = firstSubs.includes(d.sub) ? d.sub
        : (firstSubs.includes(d.btype) ? d.btype : (firstSubs[0] || ''));
      const subOpts = firstSubs.map(s => `<option value="${esc(s)}" ${defSub === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
      const cycleOpts = BILL_CYCLES.map(c => `<option value="${c.key}" ${d.cycle === c.key ? 'selected' : ''}>${c.label}</option>`).join('');

      const mask = this.openModal(`
        <div class="modal-title">${b ? '编辑待办账单' : '添加待办账单'}<button class="icon-btn" style="display:flex" data-close>✕</button></div>
        <div class="modal-body">
          <div class="field"><label>账单名称</label><input id="bm-name" type="text" maxlength="40" placeholder="如：招商银行房贷" value="${esc(d.name)}"></div>
          <div class="field-row">
            <div class="field"><label>大类</label><select id="bm-cat">${catOpts}</select></div>
            <div class="field"><label>小类</label><select id="bm-sub">${subOpts}</select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>周期</label><select id="bm-cycle">${cycleOpts}</select></div>
            <div class="field" id="bm-cycmonths-field" ${isCustomCycle ? '' : 'hidden'}><label>每隔（月）</label><input id="bm-cycmonths" type="number" min="1" max="60" step="1" value="${Math.max(1, Number(d.cycle_months) || 1)}"></div>
          </div>
          <div class="field-row">
            <div class="field" id="bm-duemonth-field" ${isYearly ? '' : 'hidden'}><label>每年几月</label><select id="bm-duemonth">${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<option value="${m}" ${Number(d.due_month) === m ? 'selected' : ''}>${m} 月</option>`).join('')}</select></div>
            <div class="field"><label>到期日（几号）</label><input id="bm-dueday" type="number" min="1" max="31" step="1" value="${Math.max(1, Number(d.due_day) || 1)}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>开始日期</label><input id="bm-start" type="text" class="cal-input" readonly value="${esc(d.start_date || todayStr())}" data-date="${esc(d.start_date || todayStr())}" placeholder="选择日期"></div>
            <div class="field"><label>结束日期</label><select id="bm-endmode"><option value="never" ${d.end_mode !== 'date' ? 'selected' : ''}>永不结束</option><option value="date" ${d.end_mode === 'date' ? 'selected' : ''}>指定日期</option></select></div>
            <div class="field" id="bm-end-field" ${d.end_mode === 'date' ? '' : 'hidden'}><label>结束于</label><input id="bm-end" type="text" class="cal-input" readonly value="${esc(d.end_date || '')}" data-date="${esc(d.end_date || '')}" placeholder="选择日期"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>预设金额（元，可选）</label><input id="bm-amount" class="amt-input" type="number" min="0" step="0.01" placeholder="0.00" value="${d.preset_amount != null ? Number(d.preset_amount) : ''}"></div>
          </div>
          <div class="field"><label>备注</label><textarea id="bm-note" rows="2" placeholder="选填">${esc(d.note || '')}</textarea></div>
          <p class="bill-form-tip" id="bm-preview"></p>
          <p class="bill-form-tip">预设金额设置后每期沿用，直到你手动修改；确认「已付」时若没有预设金额，会提示填写实际金额。</p>
        </div>
        <div class="modal-foot"><div class="modal-acts">
          ${b ? '<button class="btn btn-danger" id="bm-del" style="margin-right:auto">删除</button>' : ''}
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-primary" id="bm-save">保存</button>
        </div></div>
      `, true, '', 'form-mask');

      const $ = id => document.getElementById(id);
      const catSel = $('bm-cat'), subSel = $('bm-sub'), cycleSel = $('bm-cycle'), endModeSel = $('bm-endmode');
      const cycField = $('bm-cycmonths-field'), dueMonthField = $('bm-duemonth-field'), endField = $('bm-end-field');
      const refresh = () => {
        cycField.hidden = cycleSel.value !== 'custom';
        dueMonthField.hidden = cycleSel.value !== 'yearly';
        endField.hidden = endModeSel.value !== 'date';
      };
      refresh();
      cycleSel.onchange = refresh;
      endModeSel.onchange = refresh;
      // 切大类时重建小类选项
      const fillSubs = () => {
        subSel.innerHTML = subsOf(catSel.value).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
        this.enhanceSelects(subSel);
      };
      this.enhanceSelects(mask);

      // 下一次到期预览（随输入即时更新）
      const previewEl = $('bm-preview');
      const updatePreview = () => {
        try {
          const tmp = {
            cycle: cycleSel.value,
            cycle_months: parseInt($('bm-cycmonths').value, 10) || 1,
            due_day: parseInt($('bm-dueday').value, 10) || 1,
            due_month: parseInt($('bm-duemonth').value, 10) || 1,
            start_date: $('bm-start').dataset.date || todayStr()
          };
          const next = billSchedule(tmp, todayStr()).next;
          previewEl.textContent = next ? '下一次到期：' + billDateText(next, true) : '下一次到期：—';
        } catch (e) { previewEl.textContent = ''; }
      };
      ['bm-cycmonths', 'bm-dueday', 'bm-duemonth', 'bm-start'].forEach(id => {
        const elx = $(id);
        if (elx) elx.addEventListener('change', updatePreview);
      });
      catSel.onchange = () => { fillSubs(); updatePreview(); };
      cycleSel.addEventListener('change', updatePreview);
      updatePreview();

      $('bm-start').onclick = () => this.openCalendar($('bm-start'));
      $('bm-end').onclick = () => this.openCalendar($('bm-end'));

      const delBtn = $('bm-del');
      if (delBtn) delBtn.onclick = () => { this.closeModal(); this.deleteBill(b.id); };

      $('bm-save').onclick = async () => {
        const name = $('bm-name').value.trim();
        if (!name) return this.toast('请填写账单名称', 'err');
        const cat = catSel.value || '';
        const sub = subSel.value || '';
        if (!cat || !sub) return this.toast('请选择大类和小类', 'err');
        const cycle = cycleSel.value;
        const cycleMonths = Math.max(1, Math.min(60, parseInt($('bm-cycmonths').value, 10) || 1));
        const dueDay = Math.max(1, Math.min(31, parseInt($('bm-dueday').value, 10) || 1));
        const dueMonth = Math.max(1, Math.min(12, parseInt($('bm-duemonth').value, 10) || 1));
        const startDate = $('bm-start').dataset.date || $('bm-start').value || todayStr();
        const endMode = endModeSel.value;
        const endDate = endMode === 'date' ? ($('bm-end').dataset.date || $('bm-end').value || '') : '';
        if (endMode === 'date' && !endDate) return this.toast('请选择结束日期', 'err');
        if (endMode === 'date' && endDate < startDate) return this.toast('结束日期不能早于开始日期', 'err');
        const amtRaw = $('bm-amount').value;
        const preset = amtRaw === '' ? null : Math.max(0, Number(amtRaw) || 0);
        const note = $('bm-note').value.trim();
        const row = {
          name, cat, sub, btype: sub, // btype 继续写入，兼容旧版本客户端与年度统计
          cycle, cycle_months: cycleMonths,
          due_day: dueDay, due_month: dueMonth,
          start_date: startDate, end_mode: endMode, end_date: endDate,
          preset_amount: preset, note
        };
        try {
          if (b) {
            await Store.update('bills', b.id, row);
            Object.assign(b, row);
            this.toast('待办账单已更新', 'ok');
          } else {
            const created = await Store.insert('bills', Object.assign({ paused: false, paid_period: '' }, row));
            if (created && created.id && !billList().some(x => x.id === created.id)) this.state.bills.push(created);
            this.toast('待办账单已创建', 'ok');
          }
          this.closeModal();
          this.renderBills();
        } catch (e) {
          this.toast(e.message || '保存失败', 'err');
        }
      };
    },

    /* ---------- 暂停 / 启用 ---------- */
    async toggleBillPause(id) {
      const b = billList().find(x => x.id === id);
      if (!b) return;
      const next = !b.paused;
      try {
        await Store.update('bills', id, { paused: next });
        b.paused = next;
        this.toast(next ? '已暂停' : '已启用', 'ok');
        this.renderBills();
      } catch (e) { this.toast(e.message || '操作失败', 'err'); }
    },

    /* ---------- 删除 ---------- */
    async deleteBill(id) {
      const b = billList().find(x => x.id === id);
      if (!b) return;
      const ok = await this.confirmDialog('删除待办账单', '确定删除「' + (b.name || '该账单') + '」吗？已记入账册的历史记录不会删除。');
      if (!ok) return;
      try {
        await Store.remove('bills', id);
        this.state.bills = billList().filter(x => x.id !== id);
        this.toast('已删除', 'ok');
        this.renderBills();
      } catch (e) { this.toast(e.message || '删除失败', 'err'); }
    },

    /* ---------- 确认已付：写入账册并回填关联 ---------- */
    async payBill(billId, dueDate) {
      const b = billList().find(x => x.id === billId);
      if (!b) { this.toast('账单不存在'); return false; }
      const today = todayStr();
      const st = billStatus(b, today);
      const occurrence = dueDate || st.dueDate || st.nextDate;
      if (!occurrence) { this.toast('该账单暂无应期'); return false; }
      if (b.paid_period && b.paid_period >= occurrence) { this.toast('该期已支付'); return false; }

      let amount = Number(b.preset_amount);
      if (!(amount > 0)) {
        const raw = await this.promptDialog('填写实际金额', '本期「' + (b.name || st.displayName) + '」实际支付金额（元）', '');
        if (raw == null) return false;
        amount = Number(raw);
        if (!(amount > 0)) { this.toast('请输入正确金额', 'err'); return false; }
      }

      const ledgerId = this.state.currentLedgerId || (this.state.ledgers[0] || {}).id;
      if (!ledgerId) { this.toast('请先选择一个账本', 'err'); return false; }
      // 入账归类：优先用账单里选好的「大类 / 小类」；老数据没有这两个字段时退回「固定支出」+ 类型名
      const cat = (b.cat && this.catByName(ledgerId, b.cat)) ? b.cat
        : (this.catByName(ledgerId, '固定支出') ? '固定支出' : ((this.catsOf(ledgerId)[0] || {}).name || ''));
      const catObj = this.catByName(ledgerId, cat);
      const subs = (catObj && catObj.subs) || [];
      let sub = b.sub || b.btype || b.name || st.displayName;
      if (b.sub && subs.includes(b.sub)) sub = b.sub;
      else if (subs.includes(b.name)) sub = b.name;
      else if (subs.includes(b.btype)) sub = b.btype;

      try {
        const rec = await Store.insert('records', {
          ledger_id: ledgerId,
          category: cat,
          sub,
          amount,
          note: '周期性账单：' + (b.name || st.displayName),
          date: occurrence,
          kind: 'expense',
          favorite: false,
          rating: 0
        });
        if (rec && rec.id) this.state.records.push(rec);
        const patch = {
          paid_period: occurrence,
          paid_amount: amount,
          paid_record_id: (rec && rec.id) || null,
          paid_at: new Date().toISOString()
        };
        await Store.update('bills', b.id, patch);
        Object.assign(b, patch);
        this.toast('已确认支付 ' + fmtMoney(amount) + '，已记入账册', 'ok');
        this.renderBills();
        return true;
      } catch (e) {
        this.toast(e.message || '支付确认失败', 'err');
        return false;
      }
    },

    /* ---------- 导航红点 ---------- */
    updateBillsBadge() {
      const badge = document.getElementById('bills-badge');
      if (!badge) return;
      const today = todayStr();
      let n = 0;
      billList().forEach(b => {
        if (b.paused) return;
        const st = billStatus(b, today);
        const inWindow = st.state !== 'paid' && st.state !== 'ended' && st.daysSince != null && st.daysSince >= -3 && st.daysSince <= 3;
        if (st.state === 'overdue' || inWindow) n++;
      });
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.hidden = false;
      } else {
        badge.textContent = '';
        badge.hidden = true;
      }
    }
  });
})();

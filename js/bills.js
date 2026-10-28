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
      const autoNotices = this.billAutoNotices();

      const rank = st => st.state === 'overdue' ? 0 : (st.state === 'pending' || st.state === 'auto') ? 1 : st.state === 'upcoming' ? 2 : st.state === 'paid' ? 3 : st.state === 'paused' ? 4 : 5;
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
        ${autoNotices.length ? this.billAutoNoticeHTML(autoNotices) : ''}
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
      const ack = el.querySelector('#bill-auto-ack');
      if (ack) ack.onclick = () => {
        this.markAutoNoticesSeen(autoNotices.map(r => this._billAutoKey(r.b)));
        this.renderBills();
      };
      el.querySelectorAll('[data-auto-fix]').forEach(btn => {
        btn.onclick = () => this.correctBillAmount(btn.dataset.autoFix);
      });
      body.querySelectorAll('[data-bill-act]').forEach(btn => {
        const id = btn.dataset.bid, act = btn.dataset.billAct;
        btn.onclick = () => {
          if (act === 'pay') this.payBill(id);
          else if (act === 'edit') this.openBillModal(id);
          else if (act === 'pause') this.toggleBillPause(id);
          else if (act === 'del') this.deleteBill(id);
          else if (act === 'fix') this.correctBillAmount(id);
        };
      });
      this.enhanceSelects(el);
      if (this.updateBillsBadge) this.updateBillsBadge();
    },

    billCardHTML(b, st) {
      const meta = st.meta;
      const amt = Number(b.preset_amount);
      const isAuto = billIsAuto(b);
      const autoOk = billAutoReady(b);
      const degraded = isAuto && !autoOk;   // 自动付缺预设金额 → 降级走手动确认
      let dueLine = '';
      if (st.paused) {
        dueLine = billDueText(b) + ' · 已暂停';
      } else if (st.ended) {
        dueLine = billDueText(b) + ' · 已结束';
      } else if (st.state === 'paid') {
        const how = b.paid_by === 'auto' ? '本期已自动扣款' : '本期已支付';
        dueLine = how + (Number(b.paid_amount) > 0 ? ' ' + fmtMoney(Number(b.paid_amount)) : '') + (st.dueDate ? ' · ' + billDateText(st.dueDate) : '') + (st.nextDate ? ' · 下次 ' + billDateText(st.nextDate) : '');
      } else if (st.dueDate) {
        const d = st.daysSince;
        if (autoOk && st.state === 'auto') {
          // 自动付：到期即自动入账，这里只是「等定时任务/补算执行」的过渡文案
          const over = d != null && d > 0 ? d : 0;
          dueLine = billDateText(st.dueDate) + ' 到期 · 将自动扣款并入账' + (over > 0 ? '（已过 ' + over + ' 天，等待入账）' : '');
        } else if (d != null && d > 0) {
          dueLine = '应于 ' + billDateText(st.dueDate) + ' 支付' + (d > 3 ? ' · 已逾期 ' + d + ' 天' : '');
        } else if (d === 0) {
          dueLine = '今天到期 · 请确认是否已付';
        } else if (st.daysTo != null) {
          // 剩余 ≤3 天时倒计时标红，提醒尽快处理
          const urgent = st.daysTo <= 3;
          dueLine = billDateText(st.dueDate) + ' 到期<span class="bill-countdown' + (urgent ? ' red' : '') + '">（' + st.daysTo + ' 天后）</span>' + (autoOk ? ' · 自动扣款' : '');
        } else dueLine = billDateText(st.dueDate) + ' 到期';
      }
      // 自动付但没有预设金额：明确告知已降级，避免以为会自动扣款
      if (degraded && !st.paused && !st.ended) dueLine += ' · <span class="bill-warn">未设预设金额，已降级为手动</span>';
      const canPay = !st.paused && !st.ended && !st.paid && !!st.dueDate && !autoOk;
      const canFix = st.state === 'paid' && !!b.paid_record_id;
      return `
      <div class="bill-card ${st.cls}">
        <div class="bill-ico" style="background:${meta.color}1F;color:${meta.color}">${meta.emoji}</div>
        <div class="bill-main">
          <div class="bill-name">${esc(b.name || st.displayName)}
            <span class="badge badge-${st.cls}">${esc(st.label)}</span>
            ${isAuto ? '<span class="badge badge-auto">自动</span>' : ''}
            ${st.state === 'paid' && b.paid_record_id ? '<span class="badge badge-green">已入账</span>' : ''}
            ${b.paused ? '<span class="badge badge-gray">已暂停</span>' : ''}
          </div>
          <div class="bill-meta">${esc(billDueText(b))}</div>
          <div class="bill-meta">${dueLine}</div>
        </div>
        <div class="bill-amount">${amountText(b)}<span class="sub">${amt > 0 ? (autoOk ? '预设金额 · 自动扣款' : '预设金额') : '每期填写'}</span></div>
        <div class="bill-acts">
          ${canPay ? '<button class="btn btn-primary btn-sm" data-bill-act="pay" data-bid="' + b.id + '">已付</button>' : ''}
          ${canFix ? '<button class="btn btn-ghost btn-sm" data-bill-act="fix" data-bid="' + b.id + '">修正金额</button>' : ''}
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
        start_date: todayStr(), end_mode: 'never', end_date: '', preset_amount: null, note: '',
        payment_method: 'manual'
      };
      const payMethod = billPayMethod(d);
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
          <div class="field">
            <label>付款方式</label>
            <div class="pay-method" id="bm-paymethod">
              ${BILL_PAY_METHODS.map(m => `<label class="pm-opt${payMethod === m.key ? ' on' : ''}">
                <input type="radio" name="bm-pm" value="${m.key}" ${payMethod === m.key ? 'checked' : ''}>
                <span class="pm-label">${m.label}</span>
                <span class="pm-hint">${m.hint}</span>
              </label>`).join('')}
            </div>
            <p class="bill-form-tip pm-tip" id="bm-pm-tip" ${payMethod === 'auto' ? '' : 'hidden'}>自动付账单需设置预设金额，到期将自动确认并入账。</p>
          </div>
          <div class="field-row">
            <div class="field"><label>周期</label><select id="bm-cycle">${cycleOpts}</select></div>
            <div class="field" id="bm-duemonth-field" ${isYearly ? '' : 'hidden'}><label>每年几月</label><select id="bm-duemonth">${Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<option value="${m}" ${Number(d.due_month) === m ? 'selected' : ''}>${m} 月</option>`).join('')}</select></div>
            <div class="field" id="bm-cycmonths-field" ${isCustomCycle ? '' : 'hidden'}><label>每隔（月）</label><input id="bm-cycmonths" type="number" min="1" max="60" step="1" value="${Math.max(1, Number(d.cycle_months) || 1)}"></div>
            <div class="field"><label>到期日（几号）</label><input id="bm-dueday" type="number" min="1" max="31" step="1" value="${Math.max(1, Number(d.due_day) || 1)}"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>开始日期</label><input id="bm-start" type="text" class="cal-input" readonly value="${esc(d.start_date || todayStr())}" data-date="${esc(d.start_date || todayStr())}" placeholder="选择日期"></div>
            <div class="field"><label>结束日期</label><select id="bm-endmode"><option value="never" ${d.end_mode !== 'date' ? 'selected' : ''}>永不结束</option><option value="date" ${d.end_mode === 'date' ? 'selected' : ''}>指定日期</option></select></div>
            <div class="field" id="bm-end-field" ${d.end_mode === 'date' ? '' : 'hidden'}><label>结束于</label><input id="bm-end" type="text" class="cal-input" readonly value="${esc(d.end_date || '')}" data-date="${esc(d.end_date || '')}" placeholder="选择日期"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>预设金额（元）<span id="bm-amt-opt" class="amt-opt">可选</span></label><input id="bm-amount" class="amt-input" type="number" min="0" step="0.01" placeholder="0.00" value="${d.preset_amount != null ? Number(d.preset_amount) : ''}"></div>
          </div>
          <div class="field"><label>备注</label><textarea id="bm-note" rows="2" placeholder="选填">${esc(d.note || '')}</textarea></div>
          <p class="bill-form-tip" id="bm-preview"></p>
          <p class="bill-form-tip">预设金额设置后每期沿用，直到你手动修改；手动付在确认「已付」时若没有预设金额，会提示填写实际金额。</p>
        </div>
        <div class="modal-foot"><div class="modal-acts">
          ${b ? '<button class="btn btn-danger" id="bm-del" style="margin-right:auto">删除</button>' : ''}
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-primary" id="bm-save">保存</button>
        </div></div>
      `, false, 'edit-modal bill-modal', 'form-mask');

      // 滚动条：与「新增记账 / 编辑记录」一致——平时隐形，滚动时显示浅灰 2px 细线，停止后隐去
      const modalBody = mask.querySelector('.modal-body');
      if (modalBody) {
        let scrollTm = null;
        modalBody.addEventListener('scroll', () => {
          modalBody.classList.add('mscrolling');
          clearTimeout(scrollTm);
          scrollTm = setTimeout(() => modalBody.classList.remove('mscrolling'), 900);
        }, { passive: true });
      }

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

      // 付款方式：选「自动付」时提示必须填预设金额，并同步金额标签
      const pmSync = () => {
        const checked = mask.querySelector('input[name="bm-pm"]:checked');
        const auto = !!checked && checked.value === 'auto';
        $('bm-pm-tip').hidden = !auto;
        const opt = $('bm-amt-opt');
        opt.textContent = auto ? '自动付必填' : '可选';
        opt.className = 'amt-opt' + (auto ? ' req' : '');
        mask.querySelectorAll('.pm-opt').forEach(o => {
          const inp = o.querySelector('input');
          if (inp) o.classList.toggle('on', !!inp.checked);
        });
      };
      mask.querySelectorAll('input[name="bm-pm"]').forEach(r => r.addEventListener('change', pmSync));
      pmSync();

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
        const pmChecked = mask.querySelector('input[name="bm-pm"]:checked');
        const paymentMethod = (pmChecked && pmChecked.value) === 'auto' ? 'auto' : 'manual';
        if (paymentMethod === 'auto' && !(Number(preset) > 0)) {
          this.toast('自动付账单需先填写预设金额', 'err');
          const amtEl = $('bm-amount');
          if (amtEl) { amtEl.focus(); amtEl.classList.add('invalid'); }
          return;
        }
        const note = $('bm-note').value.trim();
        const row = {
          name, cat, sub, btype: sub, // btype 继续写入，兼容旧版本客户端与年度统计
          cycle, cycle_months: cycleMonths,
          due_day: dueDay, due_month: dueMonth,
          start_date: startDate, end_mode: endMode, end_date: endDate,
          preset_amount: preset, note, payment_method: paymentMethod
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

    /* ---------- 入账：手动「已付」与自动付共用 ---------- */
    /* 该账单该落到哪个大类/小类：优先用账单里选好的，老数据退回「固定支出」+ 类型名 */
    _billEntryTarget(b, ledgerId) {
      const st = billStatus(b, todayStr());
      const cat = (b.cat && this.catByName(ledgerId, b.cat)) ? b.cat
        : (this.catByName(ledgerId, '固定支出') ? '固定支出' : ((this.catsOf(ledgerId)[0] || {}).name || ''));
      const catObj = this.catByName(ledgerId, cat);
      const subs = (catObj && catObj.subs) || [];
      let sub = b.sub || b.btype || b.name || st.displayName;
      if (b.sub && subs.includes(b.sub)) sub = b.sub;
      else if (subs.includes(b.name)) sub = b.name;
      else if (subs.includes(b.btype)) sub = b.btype;
      return { cat, sub };
    },

    /* 结清某一期：先原子认领（防并发重复入账）→ 写 records → 回填关联
       by = 'manual'（用户点已付）| 'auto'（到期自动扣款）
       返回 false 表示该期已被其他地方处理过，调用方应停止 */
    async _settleBill(b, occurrence, amount, by) {
      const prevPeriod = b.paid_period || '';
      const ledgerId = this.state.currentLedgerId || ((this.state.ledgers || [])[0] || {}).id;
      if (!ledgerId) throw new Error('请先选择一个账本');
      const target = this._billEntryTarget(b, ledgerId);
      const nowIso = new Date().toISOString();
      const claimed = await Store.claimBillPeriod(b.id, occurrence, {
        paid_period: occurrence,
        paid_amount: amount,
        paid_by: by,
        paid_at: nowIso
      });
      if (!claimed) return false;
      Object.assign(b, { paid_period: occurrence, paid_amount: amount, paid_by: by, paid_at: nowIso });
      try {
        const rec = await Store.insert('records', {
          ledger_id: ledgerId,
          category: target.cat,
          sub: target.sub,
          amount,
          note: '周期性账单：' + (b.name || '账单') + (by === 'auto' ? '（自动扣款）' : ''),
          date: occurrence,
          kind: 'expense',
          favorite: false,
          rating: 0
        });
        const rid = (rec && rec.id) || null;
        if (rec && rec.id) this.state.records.push(rec);
        await Store.update('bills', b.id, { paid_record_id: rid });
        b.paid_record_id = rid;
        return true;
      } catch (e) {
        // 入账失败要回滚认领，否则会出现「显示已支付但账册里没有记录」
        const back = { paid_period: prevPeriod, paid_amount: null, paid_by: '', paid_at: null, paid_record_id: null };
        Object.assign(b, back);
        try { await Store.update('bills', b.id, back); } catch (e2) { /* 尽力而为 */ }
        throw e;
      }
    },

    /* ---------- 手动付：确认已付 ---------- */
    async payBill(billId, dueDate) {
      const b = billList().find(x => x.id === billId);
      if (!b) { this.toast('账单不存在'); return false; }
      if (billAutoReady(b)) { this.toast('该账单为自动付，到期会自动入账'); return false; }
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

      try {
        const ok = await this._settleBill(b, occurrence, amount, 'manual');
        if (!ok) { this.toast('该期已支付'); return false; }
        this.toast('已确认支付 ' + fmtMoney(amount) + '，已记入账册', 'ok');
        this.renderBills();
        return true;
      } catch (e) {
        this.toast(e.message || '支付确认失败', 'err');
        return false;
      }
    },

    /* ---------- 自动付：到期自动入账 ---------- */
    /* 打开应用 / 页面切回 / 每 30 分钟跑一次；与服务端 pg_cron 互为兜底，
       两边都靠 paid_period 原子认领，谁先到谁入账，不会重复。 */
    async autoSettleBills() {
      if (this._autoSettling) return 0;
      if (Store.mode !== 'supabase' && !(Store.user)) return 0;
      this._autoSettling = true;
      let settled = 0;
      try {
        const today = todayStr();
        const list = billList().slice();
        for (const b of list) {
          if (b.paused || !billAutoReady(b)) continue;   // 暂停 / 缺预设金额 → 降级走手动
          if (b.end_mode === 'date' && b.end_date && today > b.end_date) continue;
          const amt = Number(b.preset_amount);
          const due = billOccurrencesUntil(b, today).filter(d => d > (b.paid_period || ''));
          for (const occ of due.slice(0, 24)) {
            let ok = false;
            try { ok = await this._settleBill(b, occ, amt, 'auto'); }
            catch (e) { console.warn('自动付入账失败', e); break; }
            if (!ok) break;   // 已被服务端定时任务处理
            settled++;
          }
        }
        if (settled) {
          if (this.state.route === 'bills') this.renderBills();
          else if (this.updateBillsBadge) this.updateBillsBadge();
          this.notifyAutoPaid();
        }
      } finally {
        this._autoSettling = false;
      }
      return settled;
    },

    /* ---------- 「已自动支付」通知（供核对 / 修正） ---------- */
    _billAutoKey(b) { return b.id + '_' + (b.paid_period || ''); },
    _billAutoSeen() {
      try {
        const arr = JSON.parse(localStorage.getItem('fin_bill_auto_seen') || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    },
    markAutoNoticesSeen(keys) {
      try {
        const set = new Set(this._billAutoSeen());
        (keys || []).forEach(k => set.add(k));
        localStorage.setItem('fin_bill_auto_seen', JSON.stringify(Array.from(set).slice(-300)));
      } catch (e) { /* ignore */ }
    },
    billAutoNotices() {
      const seen = new Set(this._billAutoSeen());
      const today = todayStr();
      return billList()
        .filter(b => b.payment_method === 'auto' && b.paid_by === 'auto' && b.paid_period && b.paid_record_id)
        .filter(b => !seen.has(this._billAutoKey(b)))
        .filter(b => {
          const d = String(b.paid_at || '').slice(0, 10);
          return !d || dayDiff(d, today) <= 60;   // 太久远的自动入账不再打扰
        })
        .map(b => ({ b, st: billStatus(b, today) }))
        .sort((x, y) => String(y.b.paid_period || '').localeCompare(String(x.b.paid_period || '')));
    },
    billAutoNoticeHTML(rows) {
      return `
      <div class="bill-auto-notice">
        <div class="ban-head">
          <div class="ban-title">已自动支付<span class="ban-sub">按预设金额自动入账，可核对或修正本次金额</span></div>
          <button class="btn btn-ghost btn-sm" id="bill-auto-ack">全部已核对</button>
        </div>
        ${rows.map(r => `
          <div class="ban-row">
            <div class="bill-ico" style="width:34px;height:34px;font-size:16px;background:${r.st.meta.color}1F;color:${r.st.meta.color}">${r.st.meta.emoji}</div>
            <div class="ban-main">
              <b>${esc(r.b.name || r.st.displayName)}</b>
              <span>${fmtMoney(Number(r.b.paid_amount) || 0)} 已自动扣款并入账 · ${billDateText(r.b.paid_period)}</span>
            </div>
            <button class="btn btn-ghost btn-sm" data-auto-fix="${r.b.id}">修正金额</button>
          </div>`).join('')}
      </div>`;
    },
    notifyAutoPaid() {
      const rows = this.billAutoNotices();
      if (!rows.length) return;
      const key = 'fin_bill_auto_toast_' + todayStr();
      try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
      if (rows.length === 1) {
        const r = rows[0];
        this.toast('「' + (r.b.name || r.st.displayName) + '」' + fmtMoney(Number(r.b.paid_amount) || 0) + ' 已自动扣款并入账', 'ok');
      } else {
        this.toast('有 ' + rows.length + ' 笔账单已自动扣款并入账，可到「待办账单」核对', 'ok');
      }
    },

    /* ---------- 修正自动入账金额（只改这一笔，不动预设金额） ---------- */
    async correctBillAmount(billId) {
      const b = billList().find(x => x.id === billId);
      if (!b) return;
      if (!b.paid_record_id) return this.toast('这一期没有关联的账册记录，无法修正');
      const raw = await this.promptDialog(
        '修正入账金额',
        (b.name || '账单') + ' · ' + billDateText(b.paid_period) + ' 的实际金额（只改这一笔，不改预设金额）',
        String(Number(b.paid_amount) || '')
      );
      if (raw == null) return;
      const amount = Number(raw);
      if (!(amount > 0)) return this.toast('请输入正确金额', 'err');
      try {
        await Store.update('records', b.paid_record_id, { amount });
        await Store.update('bills', b.id, { paid_amount: amount });
        b.paid_amount = amount;
        const rec = (this.state.records || []).find(r => r.id === b.paid_record_id);
        if (rec) rec.amount = amount;
        this.toast('已修正为 ' + fmtMoney(amount) + '，预设金额不变', 'ok');
        this.renderBills();
      } catch (e) {
        this.toast(e.message || '修正失败', 'err');
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
        if (billAutoReady(b)) return;   // 自动付由到期自动入账，不产生待付红点
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

/* ============ Canvas 图表：环形图 + 折线图 ============ */
const Charts = {
  _tip: null,

  _tipEl() {
    if (!this._tip) {
      this._tip = document.createElement('div');
      this._tip.className = 'chart-tip';
      document.body.appendChild(this._tip);
    }
    return this._tip;
  },

  _setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 400;
    const h = canvas.clientHeight || parseInt(canvas.getAttribute('height')) || 260;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
    return { ctx, w, h };
  },

  _showTip(x, y, html) {
    const t = this._tipEl();
    t.innerHTML = html;
    t.style.opacity = '1';
    const r = t.getBoundingClientRect();
    t.style.left = Math.min(x + 12, window.innerWidth - r.width - 10) + 'px';
    t.style.top = (y - r.height - 10) + 'px';
  },
  _hideTip() { if (this._tip) this._tip.style.opacity = '0'; },

  /* 环形图：items = [{label, value, color}]，centerLabel 居中文字 */
  donut(canvas, items, centerLabel) {
    if (!canvas) return;
    const { ctx, w, h } = this._setup(canvas);
    const total = items.reduce((s, i) => s + i.value, 0);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 8;
    const r = R * 0.64;

    if (!total) {
      ctx.fillStyle = '#9CA3AF';
      ctx.textAlign = 'center';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText('暂无数据', cx, cy);
      return;
    }

    let start = -Math.PI / 2;
    items.forEach(it => {
      const ang = (it.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = it.color;
      ctx.fill();
      start += ang;
    });

    // 中心镂空
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    if (centerLabel) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6B7280';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(centerLabel.label || '', cx, cy - 6);
      ctx.fillStyle = '#374151';
      ctx.font = '700 19px Inter, sans-serif';
      ctx.fillText(centerLabel.value || '', cx, cy + 16);
    }

    // tooltip
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const dx = mx - cx, dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < r || dist > R) { this._hideTip(); return; }
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      let acc = 0, hit = null;
      for (const it of items) {
        const a = (it.value / total) * Math.PI * 2;
        if (ang >= acc && ang < acc + a) { hit = it; break; }
        acc += a;
      }
      if (hit) {
        this._showTip(e.clientX, e.clientY,
          esc(hit.label) + ' · ' + fmtMoney(hit.value) + '（' + (hit.value / total * 100).toFixed(1) + '%）');
      } else this._hideTip();
    };
    canvas.onmouseleave = () => this._hideTip();
  },

  /* 折线图：labels, series=[{name,color,data}] */
  line(canvas, labels, series) {
    if (!canvas) return;
    const { ctx, w, h } = this._setup(canvas);
    const padL = 52, padR = 14, padT = 16, padB = 30;
    const cw = w - padL - padR, chh = h - padT - padB;
    const all = series.flatMap(s => s.data);
    let max = Math.max(...all, 0);
    if (max <= 0) max = 100;
    max = max * 1.12;
    const n = labels.length;

    // 网格与 Y 轴
    ctx.strokeStyle = '#F3F4F6';
    ctx.fillStyle = '#9CA3AF';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + chh - (chh * i / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      const v = max * i / 4;
      ctx.fillText(v >= 10000 ? (v / 10000).toFixed(1) + '万' : Math.round(v), padL - 8, y + 4);
    }

    // X 轴标签（自动抽稀）
    const step = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(cw / 56))));
    ctx.textAlign = 'center';
    labels.forEach((lb, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const x = padL + (n === 1 ? cw / 2 : cw * i / (n - 1));
      ctx.fillText(lb, x, h - 8);
    });

    const px = i => padL + (n === 1 ? cw / 2 : cw * i / (n - 1));
    const py = v => padT + chh - (v / max) * chh;

    series.forEach(s => {
      if (s.data.length < 1) return;
      // 面积
      const grad = ctx.createLinearGradient(0, padT, 0, padT + chh);
      grad.addColorStop(0, s.color + '2E');
      grad.addColorStop(1, s.color + '00');
      ctx.beginPath();
      s.data.forEach((v, i) => { i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)); });
      ctx.lineTo(px(s.data.length - 1), padT + chh);
      ctx.lineTo(px(0), padT + chh);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      // 线
      ctx.beginPath();
      s.data.forEach((v, i) => { i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)); });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // 点
      s.data.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(px(i), py(v), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      if (mx < padL - 6 || mx > w - padR + 6) { this._hideTip(); return; }
      const i = Math.round((mx - padL) / (cw / Math.max(1, n - 1)));
      const idx = Math.max(0, Math.min(n - 1, i));
      const rows = series.map(s => esc(s.name) + ' ' + fmtMoney(s.data[idx])).join('<br>');
      this._showTip(e.clientX, e.clientY, labels[idx] + '<br>' + rows);
    };
    canvas.onmouseleave = () => this._hideTip();
  }
};

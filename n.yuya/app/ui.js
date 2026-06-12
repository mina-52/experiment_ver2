/* =============================================================================
 *  RiceLodge Studio ― UI 制御
 *  ui.js : スライダー/プリセット/ダッシュボード/グラフ/エクスポート
 * ========================================================================== */
'use strict';

(function () {
  const canvas = document.getElementById('field');
  const sim = new LodgingSim(canvas);

  /* --- スライダー定義（id, 単位, 表示整形） ------------------------- */
  const sliders = {
    stemStrength: v => v.toFixed(1),
    strengthVar:  v => v.toFixed(1),
    culmLength:   v => `${v} cm`,
    tillers:      v => `${v} 本`,
    spacing:      v => `${v} cm`,
    growth:       v => `${Math.round(v * 100)} %`,
    nitrogen:     v => `${Math.round(v * 100)} %`,
    soilMoisture: v => `${Math.round(v * 100)} %`,
    windSpeed:    v => `${v.toFixed(1)} m/s`,
    gustiness:    v => `${Math.round(v * 100)} %`,
    windDir:      v => `${v}°`,
    rainfall:     v => `${v} mm/h`,
    shelter:      v => `${Math.round(v * 100)} %`,
    contagion:    v => `${Math.round(v * 100)} %`,
    initLodge:    v => `${v}°`,
    grid:         v => `${v}×${v}`,
    scatterVar:   v => `${Math.round(v * 100)} %`,
  };

  function bindSlider(id, fmt) {
    const el = document.getElementById(id);
    const out = document.getElementById(id + '_v');
    if (!el) return;
    const apply = () => {
      const val = parseFloat(el.value);
      if (out) out.textContent = fmt(val);
      sim.set(id, val);
      if (!sim.running) sim.draw();
    };
    el.addEventListener('input', apply);
    apply();
  }
  Object.entries(sliders).forEach(([id, fmt]) => bindSlider(id, fmt));

  /* --- 植付方式セレクト（規則植え / ドローン散播） ------------------- */
  const sowingSel = document.getElementById('sowing');
  const scatterRow = document.getElementById('scatterVarRow');
  function applySowing() {
    sim.set('sowing', sowingSel.value);
    // 散播ムラは「ドローン散播」のときだけ意味を持つ
    scatterRow.classList.toggle('disabled', sowingSel.value !== 'random');
    if (!sim.running) sim.draw();
  }
  sowingSel.addEventListener('change', applySowing);
  applySowing();

  /* --- プリセット（天候・品種・播種を独立して選択） ----------------- */
  const presets = {
    // 天候シナリオ
    calm:    { windSpeed: 3,  gustiness: 0.2, rainfall: 0,  windDir: 90 },
    normal:  { windSpeed: 8,  gustiness: 0.5, rainfall: 0 },
    strong:  { windSpeed: 18, gustiness: 0.7, rainfall: 5 },
    typhoon: { windSpeed: 35, gustiness: 0.9, rainfall: 50, soilMoisture: 0.85 },
    downpour:{ windSpeed: 22, gustiness: 1.0, rainfall: 75, soilMoisture: 0.9 },
    // 品種・栽培
    koshi:     { stemStrength: 3.5, culmLength: 105, nitrogen: 0.6, tillers: 20 },
    strongculm:{ stemStrength: 8.0, culmLength: 78,  nitrogen: 0.4, tillers: 16 },
    overfert:  { stemStrength: 4.0, culmLength: 120, nitrogen: 0.95, tillers: 28, growth: 0.8 },
    dense:     { spacing: 11, tillers: 30, culmLength: 100, nitrogen: 0.7 },
    // 播種方式
    transplant:{ sowing: 'grid' },
    drone:     { sowing: 'random', scatterVar: 0.6 },
    dronerough:{ sowing: 'random', scatterVar: 0.95 },
  };

  // 各プリセットは「自分の項目だけ」を上書きし、他カテゴリの設定は保持する
  function applyPreset(name) {
    const p = presets[name];
    if (!p) return;
    for (const [k, v] of Object.entries(p)) {
      const el = document.getElementById(k);
      if (!el) continue;
      el.value = v;
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input'));
    }
    sim.reset();
  }
  ['presetWeather', 'presetVariety', 'presetSowing'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.addEventListener('change', e => applyPreset(e.target.value));
  });

  /* --- 再生制御 ------------------------------------------------------ */
  const btnPlay = document.getElementById('btnPlay');
  let raf = null;
  function loop() {
    if (!sim.running) return;
    sim.step();
    sim.draw();
    raf = requestAnimationFrame(loop);
  }
  function play() {
    sim.running = true;
    btnPlay.textContent = '⏸ 一時停止';
    btnPlay.classList.add('on');
    loop();
  }
  function pause() {
    sim.running = false;
    btnPlay.textContent = '▶ 再生';
    btnPlay.classList.remove('on');
    if (raf) cancelAnimationFrame(raf);
  }
  btnPlay.addEventListener('click', () => sim.running ? pause() : play());
  document.getElementById('btnStep').addEventListener('click', () => {
    if (sim.running) pause();
    sim.step(); sim.draw();
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    pause(); sim.reset();
  });
  const speed = document.getElementById('speed');
  speed.addEventListener('input', () => {
    sim.set('speed', parseFloat(speed.value));
    document.getElementById('speedVal').textContent = parseFloat(speed.value).toFixed(1) + '×';
  });

  /* --- キーボードショートカット ------------------------------------ */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); sim.running ? pause() : play(); }
    if (e.key === 'r') { pause(); sim.reset(); }
  });

  /* --- ゾーンバー初期化 --------------------------------------------- */
  const zoneLabels = ['直立', 'やや傾斜', '傾斜', '倒伏', '完全倒伏'];
  const zoneColors = ['#2fbf4e', '#9bd23a', '#e8c93a', '#f0892f', '#e0392f'];
  const zonebars = document.getElementById('zonebars');
  const barEls = zoneLabels.map((lab, i) => {
    const row = document.createElement('div');
    row.className = 'zonebar';
    row.innerHTML =
      `<span class="zlab">${lab}</span>
       <div class="ztrack"><div class="zfill" style="background:${zoneColors[i]}"></div></div>
       <span class="zval">0%</span>`;
    zonebars.appendChild(row);
    return { fill: row.querySelector('.zfill'), val: row.querySelector('.zval') };
  });

  /* --- ダッシュボード更新 ------------------------------------------- */
  const elLodge = document.getElementById('lodgeRate');
  const elLean = document.getElementById('meanLean');
  const elBroken = document.getElementById('brokenRate');
  const elWind = document.getElementById('windNow');
  const elFrame = document.getElementById('frame');
  const verdict = document.getElementById('verdict');

  sim.onStats = (s) => {
    elLodge.textContent = (s.lodgeRate * 100).toFixed(1);
    elLean.textContent = s.meanLean.toFixed(1) + '°';
    elBroken.textContent = (s.brokenRate * 100).toFixed(1) + '%';
    elWind.textContent = s.windNow.toFixed(1);
    elFrame.textContent = s.t;
    s.zones.forEach((z, i) => {
      barEls[i].fill.style.width = (z * 100).toFixed(0) + '%';
      barEls[i].val.textContent = (z * 100).toFixed(0) + '%';
    });
    updateVerdict(s.lodgeRate);
    drawChart();
  };

  function updateVerdict(rate) {
    let cls, txt;
    if (rate < 0.05)      { cls = 'safe';   txt = '✅ 健全 ― 倒伏リスク低'; }
    else if (rate < 0.20) { cls = 'watch';  txt = '🟡 注意 ― 一部に倒伏'; }
    else if (rate < 0.50) { cls = 'warn';   txt = '🟠 警戒 ― 倒伏進行中'; }
    else                  { cls = 'danger'; txt = '🔴 危険 ― 圃場の半数以上が倒伏'; }
    verdict.className = 'verdict ' + cls;
    verdict.textContent = txt;
  }

  /* --- 推移グラフ ---------------------------------------------------- */
  const chart = document.getElementById('chart');
  const cctx = chart.getContext('2d');
  function fitChart() {
    const dpr = window.devicePixelRatio || 1;
    const r = chart.getBoundingClientRect();
    chart.width = r.width * dpr; chart.height = r.height * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    chart._w = r.width; chart._h = r.height;
  }
  window.addEventListener('resize', fitChart);
  fitChart();

  function drawChart() {
    const W = chart._w, H = chart._h, h = sim.history;
    cctx.clearRect(0, 0, W, H);
    // グリッド
    cctx.strokeStyle = 'rgba(255,255,255,0.08)';
    cctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = H - (g / 4) * (H - 4) - 2;
      cctx.beginPath(); cctx.moveTo(0, y); cctx.lineTo(W, y); cctx.stroke();
    }
    if (h.length < 2) return;
    const n = h.length;
    const xAt = i => (i / (n - 1)) * W;
    const yAt = v => H - v * (H - 4) - 2;
    // 倒伏率
    cctx.strokeStyle = '#e0392f';
    cctx.lineWidth = 2;
    cctx.beginPath();
    h.forEach((s, i) => { const x = xAt(i), y = yAt(s.lodgeRate);
      i ? cctx.lineTo(x, y) : cctx.moveTo(x, y); });
    cctx.stroke();
    // 風速(正規化40m/s)
    cctx.strokeStyle = 'rgba(90,170,255,0.7)';
    cctx.lineWidth = 1.2;
    cctx.beginPath();
    h.forEach((s, i) => { const x = xAt(i), y = yAt(Math.min(1, s.windNow / 40));
      i ? cctx.lineTo(x, y) : cctx.moveTo(x, y); });
    cctx.stroke();
  }

  /* --- エクスポート -------------------------------------------------- */
  document.getElementById('btnCsv').addEventListener('click', () => {
    let csv = 'frame,lodge_rate,broken_rate,mean_lean_deg,wind_m_s,' +
              'zone1,zone2,zone3,zone4,zone5\n';
    for (const s of sim.history) {
      csv += [s.t, s.lodgeRate.toFixed(4), s.brokenRate.toFixed(4),
        s.meanLean.toFixed(2), s.windNow.toFixed(2),
        ...s.zones.map(z => z.toFixed(4))].join(',') + '\n';
    }
    download(csv, `ricelodge_${stamp()}.csv`, 'text/csv');
  });
  document.getElementById('btnSnap').addEventListener('click', () => {
    canvas.toBlob(b => {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url; a.download = `ricelodge_${stamp()}.png`; a.click();
      URL.revokeObjectURL(url);
    });
  });
  function download(text, name, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function stamp() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  /* --- 初期描画 ------------------------------------------------------ */
  sim.reset();
})();

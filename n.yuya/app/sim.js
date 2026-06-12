/* =============================================================================
 *  RiceLodge Studio ― 倒伏シミュレーション エンジン
 *  sim.js : 物理モデル + エージェント（株/茎）の状態更新と描画
 *
 *  モデルの考え方（作物倒伏の力学に基づく）
 *  ------------------------------------------------------------------
 *  ・各「茎(Stem)」は基部まわりの傾斜角 theta(0=直立, 90°=完全倒伏) を持つ。
 *  ・風による曲げモーメント   M_wind = Kw * v^2 * L * cos(theta)
 *      - 風の抗力は風速の2乗に比例。レバー長 L=稈長。倒れるほど受風面が減る。
 *  ・自重による曲げモーメント M_self = W * L * sin(theta)
 *      - 穂重(登熟+降雨で増加)。傾くほど増え、倒伏を加速させる(暴走項)。
 *  ・茎の抵抗(復元)モーメント R = S * rootFactor
 *      - S=折損強度(茎強度から生成)。rootFactor は土壌水分が高いほど低下。
 *  ・M_wind + M_self > R のとき茎は降伏して theta が増加。
 *    M が破断強度を超える、または塑性限界角を越えると“永久倒伏(折損)”。
 *  ・M < R かつ未折損なら、無風時に弾性復元して立ち上がる。
 *  ・隣接株の影響: 倒れた茎は隣に寄りかかる(相互作用)。
 *  ------------------------------------------------------------------
 *  論文的背景: 倒伏は (外力+自重) による曲げモーメントが稈の曲げ強度を
 *  超えたときに発生する。倒伏指数は草丈・稈重に比例し折損強度に反比例。
 * ========================================================================== */

'use strict';

const DEG = Math.PI / 180;

/* 1本の茎(穂) ----------------------------------------------------------- */
class Stem {
  constructor(cx, cy, offX, offY, strength) {
    this.cx = cx;            // 所属株の中心
    this.cy = cy;
    this.offX = offX;        // 株中心からの初期オフセット(描画用)
    this.offY = offY;
    this.strength = strength;// 折損(曲げ破断)強度
    this.theta = 0;          // 傾斜角 [deg] 0=直立
    this.dir = 0;            // 倒れる方位 [rad]
    this.broken = false;     // 折損(永久倒伏)したか
    this.phase = Math.random() * Math.PI * 2; // 揺れの位相
  }

  get zone() {
    // 0..90° を 5 段階のゾーンへ(従来システム互換)
    return Math.min(5, Math.floor(this.theta / 18) + 1);
  }
  get lodged() { return this.theta >= 45; } // 45°以上を「倒伏」と判定
}

/* 株(クランプ) --------------------------------------------------------- */
class Clump {
  constructor(cx, cy) {
    this.cx = cx;
    this.cy = cy;
    this.stems = [];
    this.lean = 0;       // 株全体の平均倒伏角(隣接影響用キャッシュ)
    this.lvx = 0;        // 倒れ込みベクトル(水平投影)の平均 X
    this.lvy = 0;        //   〃                               Y
    this.shelter = 0;    // 風よけ係数 0(露出)〜0.5(遮蔽)
    this.windLocal = 0;  // この株が実際に受ける局所風速
    this.leanLoad = 0;   // 風上の倒伏株から受ける寄りかかり荷重
    this.neighbors = []; // {o,dist,ux,uy,w} 近傍株と幾何情報
  }
}

/* シミュレーション本体 ------------------------------------------------- */
class LodgingSim {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // 既定パラメータ（UI から上書きされる）
    this.params = {
      stemStrength: 5.0,   // 茎強度 (1-10)  ← must 相当
      strengthVar: 1.7,    // 強度のばらつき(標準偏差)
      culmLength: 90,      // 稈長 cm        ← kan 相当
      spacing: 18,         // 株間隔 cm       ← interval 相当
      tillers: 18,         // 株あたり茎数    ← m 相当
      windSpeed: 8,        // 平均風速 m/s
      gustiness: 0.6,      // 突風度 0-1
      windDir: 90,         // 主風向 deg (90=下向き)
      rainfall: 0,         // 降雨量 mm/h (0-80)
      nitrogen: 0.5,       // 窒素施肥レベル 0-1（高いほど徒長・軟弱）
      growth: 0.7,         // 生育ステージ 0(出穂)-1(完熟) → 穂重
      soilMoisture: 0.4,   // 土壌水分 0-1（高いほど根の支持力低下）
      shelter: 1.0,        // 風よけ(フェッチ)効果の強さ 0-2
      contagion: 1.0,      // 風下への寄りかかり連鎖の強さ 0-2
      initLodge: 0,        // 初期倒伏角 deg
      speed: 1.0,          // シミュレーション速度倍率
      grid: 22,            // 一辺の株数
      sowing: 'grid',      // 植付方式 'grid'=規則的(田植え) / 'random'=ドローン散播
      scatterVar: 0.5,     // 散播ムラ 0-1（ドローン散播時の密度ムラの強さ）
    };

    this.time = 0;         // 経過フレーム
    this.running = false;
    this.windNow = 0;      // 現在の瞬間風速
    this.gustSeed = Math.random() * 1000;
    this.history = [];     // [{t, lodgeRate, zones:[..]}]
    this.onStats = null;   // 統計コールバック

    this._buildField();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /* --- パラメータ反映 ------------------------------------------------ */
  set(key, value) {
    this.params[key] = value;
    if (key === 'grid' || key === 'spacing' || key === 'tillers' ||
        key === 'stemStrength' || key === 'strengthVar' || key === 'initLodge' ||
        key === 'sowing' || key === 'scatterVar') {
      this._buildField();
      this._resize();
    }
  }

  /* --- ガウス乱数 ---------------------------------------------------- */
  _gauss(mu, sigma) {
    let v;
    do {
      const u1 = Math.random(), u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = z * sigma + mu;
    } while (v <= 0.2 || v > 12);
    return v;
  }

  /* --- 標準正規乱数(平均0,分散1) ----------------------------------- */
  _randn() {
    const u1 = Math.random() || 1e-9, u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /* --- 株の植付位置を決める ----------------------------------------
   * 'grid'   : 規則的な田植え(整列・等間隔)
   * 'random' : ドローン散播(不規則な間隔)。平均密度は規則植えと揃え、
   *            scatterVar で密度ムラ(塊状の濃淡・裸地)の強さを調整する。
   * ---------------------------------------------------------------- */
  _sowPositions() {
    const p = this.params, g = p.grid;
    const pos = [];
    if (p.sowing !== 'random') {
      for (let i = 0; i < g; i++)
        for (let j = 0; j < g; j++)
          pos.push([i + 0.5, j + 0.5]); // 正規化座標(0..grid)
      return pos;
    }
    // ドローン散播: クラスタ中心の周りにガウス散布する混合モデル。
    // scatterVar=0 → 中心が多く分散小 ≒ 一様ランダム(緩やかなムラ)
    // scatterVar=1 → 中心が少なく分散大 → 強い塊状ムラ(濃い所と裸地)
    const N = g * g;                       // 総株数(平均密度は規則植えと同等)
    const v = p.scatterVar;
    const nClusters = Math.max(1, Math.round(N * (0.15 + 0.85 * (1 - v))));
    const sigma = 0.35 + v * 1.6;
    const centers = [];
    for (let c = 0; c < nClusters; c++)
      centers.push([Math.random() * g, Math.random() * g]);
    for (let k = 0; k < N; k++) {
      const c = centers[(Math.random() * nClusters) | 0];
      let x = c[0] + this._randn() * sigma;
      let y = c[1] + this._randn() * sigma;
      x = Math.min(g - 0.02, Math.max(0.02, x));
      y = Math.min(g - 0.02, Math.max(0.02, y));
      pos.push([x, y]);
    }
    return pos;
  }

  /* --- 圃場(株・茎)の生成 ------------------------------------------ */
  _buildField() {
    const p = this.params;
    this.clumps = [];
    const innerR = 8; // 株内の茎ばらまき半径(描画用)
    for (const [cx, cy] of this._sowPositions()) {
      const clump = new Clump(cx, cy);
      for (let k = 0; k < p.tillers; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * innerR;
        const strength = this._gauss(p.stemStrength, p.strengthVar);
        const s = new Stem(cx, cy, Math.cos(a) * r, Math.sin(a) * r, strength);
        s.theta = p.initLodge + Math.random() * 2;
        s.dir = p.windDir * DEG + (Math.random() - 0.5) * 0.6;
        clump.stems.push(s);
      }
      this.clumps.push(clump);
    }
    this.totalStems = this.clumps.length * p.tillers;
    this._buildNeighbors();
  }

  /* --- 近傍株リストの構築(寄りかかり影響用) -------------------------
   * 規則植え・散播のどちらでも、空間的に近い株どうしを近傍とする。
   * 空間ハッシュ(セルサイズ1)で O(N) 近傍探索する。
   * ---------------------------------------------------------------- */
  _buildNeighbors() {
    const radius = 1.6, r2 = radius * radius;
    const cells = new Map();
    const key = (ix, iy) => ix + ',' + iy;
    this.clumps.forEach((c, idx) => {
      const k = key(Math.floor(c.cx), Math.floor(c.cy));
      (cells.get(k) || cells.set(k, []).get(k)).push(idx);
    });
    for (const c of this.clumps) {
      c.neighbors = [];
      const ix = Math.floor(c.cx), iy = Math.floor(c.cy);
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++) {
          const arr = cells.get(key(ix + dx, iy + dy));
          if (!arr) continue;
          for (const idx of arr) {
            const o = this.clumps[idx];
            if (o === c) continue;
            const ddx = o.cx - c.cx, ddy = o.cy - c.cy;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 > r2) continue;
            const dist = Math.sqrt(d2) || 1e-6;
            // ux,uy: c→o の単位ベクトル。w: 近いほど大きい距離減衰重み。
            c.neighbors.push({
              o, dist, ux: ddx / dist, uy: ddy / dist,
              w: Math.max(0, 1 - dist / radius),
            });
          }
        }
    }
  }

  reset() {
    this.time = 0;
    this.history = [];
    this.gustSeed = Math.random() * 1000;
    this._buildField();
    this._emitStats();
    this.draw();
  }

  /* --- 風(シナリオ含む)の瞬間値 ----------------------------------- */
  _updateWind() {
    const p = this.params;
    const t = this.time * 0.02;
    // 突風: 低周波うねり + 高周波ノイズ（突風率は現実的に最大約1.5倍）
    const swell = Math.sin(t + this.gustSeed) * 0.5 + 0.5;          // 0-1
    const flick = (Math.sin(t * 5.3 + 2) * 0.5 + 0.5) * 0.4;
    const gustFactor = 1 + p.gustiness * (swell * 0.8 + flick * 0.5 - 0.3);
    this.windNow = Math.max(0, p.windSpeed * gustFactor);
    // 降雨は実効風荷重をやや増やす(雨滴衝撃＋濡れ)
    this.windEff = this.windNow * (1 + p.rainfall / 200);
  }

  /* --- 株間の空間相互作用(風よけ＋風下への寄りかかり) ---------------
   * 前ステップの倒伏状態をもとに、各株について
   *  ・風よけ(フェッチ): 風上で直立している隣株が局所風を弱める。
   *    風上の株が倒れると遮蔽が消え、風が貫通して風下へ倒伏が伝播する。
   *  ・寄りかかり: 風上で倒れた株が、その倒れ込む向き(=風下)の隣株に
   *    荷重を乗せる。距離が近いほど強い(距離減衰)。
   * 風上/風下は「c→隣株ベクトルと風向の内積の符号」で判定する。
   * ---------------------------------------------------------------- */
  _computeEnvironment(windEff, wux, wuy) {
    const p = this.params;
    for (const c of this.clumps) {
      let shelterRaw = 0, load = 0;
      for (const nb of c.neighbors) {
        const along = nb.ux * wux + nb.uy * wuy; // (c→隣株)・風向
        if (along >= 0) continue;                // 風上側の隣株のみが影響源
        const upw = -along;                       // 風上度 0..1
        const o = nb.o;
        // 風よけ: 風上で直立(cosθ大)している株ほど風を遮る
        shelterRaw += upw * Math.max(0, Math.cos(o.lean * DEG)) * nb.w;
        // 寄りかかり: 風上株の倒れ込みベクトルが c の方を向く成分
        const proj = -(o.lvx * nb.ux + o.lvy * nb.uy);
        if (proj > 0) load += proj * nb.w;
      }
      c.shelter = Math.min(0.5, shelterRaw * 0.7 * p.shelter);
      c.windLocal = windEff * (1 - c.shelter);
      c.leanLoad = load * p.contagion;
    }
  }

  /* --- 1ステップ更新 ------------------------------------------------ */
  step() {
    const p = this.params;
    this._updateWind();

    // 環境由来の係数
    const L = p.culmLength / 90;                       // 稈長レバー(正規化)
    const Kw = 0.00031 * (1 + p.nitrogen * 0.5);       // 受風係数(徒長で受風増)
    const rootFactor = 1 - p.soilMoisture * 0.45;      // 根の支持力(湿潤で低下)
    const stemWeak = 1 - p.nitrogen * 0.25;            // 徒長による軟弱化
    // 穂の自重モーメント係数（稈の弾性より小さく保ち、健全株は自立する）
    const Wself = (0.02 + p.growth * 0.035) * (1 + p.rainfall / 120) * L;
    const windDirRad = p.windDir * DEG;
    const wux = Math.cos(windDirRad), wuy = Math.sin(windDirRad);
    const GAIN = 5 * p.speed;
    const PLASTIC = 45;                                // 塑性限界角(永久倒伏)
    const LEAN_COEF = 0.10;                            // 寄りかかり荷重→駆動の換算

    // 空間相互作用(前ステップの倒伏状態に基づく:風よけ・寄りかかり)
    this._computeEnvironment(this.windEff, wux, wuy);

    for (const clump of this.clumps) {
      const vC = clump.windLocal;                      // 局所風(風よけ反映)
      const driveWindC = Kw * vC * vC * L;             // cos(theta) は各茎で乗じる
      const leanDrive = clump.leanLoad * LEAN_COEF;    // 風下への寄りかかり荷重
      let leanSum = 0, lvx = 0, lvy = 0;
      for (const s of clump.stems) {
        if (s.broken) {
          // 折損・永久倒伏 → 完全に倒れ込み立ち上がらない
          s.theta = Math.min(90, s.theta + 2.2 * p.speed);
          s.dir += (windDirRad - s.dir) * 0.04;
          leanSum += s.theta;
          const st = Math.sin(s.theta * DEG);
          lvx += st * Math.cos(s.dir); lvy += st * Math.sin(s.dir);
          continue;
        }
        const thr = s.theta * DEG;
        // 駆動 = 風(倒すほど受風減) + 自重(傾くほど増) + 風上からの寄りかかり
        const drive = driveWindC * Math.cos(thr) + Wself * Math.sin(thr) + leanDrive;
        // 弾性復元モーメント = 稈の剛性(茎強度)×根の支持 × 曲げ角
        const kE = s.strength * 0.05 * stemWeak * rootFactor;
        const restore = kE * thr;                      // フックの法則的な復元
        // 1ステップの変化量を制限して数値的に安定化
        s.theta += Math.max(-2, Math.min(2, (drive - restore) * GAIN));
        if (s.theta > 1) s.dir += (windDirRad - s.dir) * 0.05;
        if (s.theta < 0) s.theta = 0;
        if (s.theta > PLASTIC) s.broken = true;        // 塑性変形→永久倒伏
        if (s.theta > 90) s.theta = 90;
        leanSum += s.theta;
        const st = Math.sin(s.theta * DEG);            // 倒れ込みの水平投影
        lvx += st * Math.cos(s.dir); lvy += st * Math.sin(s.dir);
      }
      const n = clump.stems.length;
      clump.lean = leanSum / n;
      clump.lvx = lvx / n; clump.lvy = lvy / n;        // 次ステップの相互作用用
    }

    this.time++;
    if (this.time % 6 === 0) this._record();
    this._emitStats();
  }

  /* --- 統計 ---------------------------------------------------------- */
  _stats() {
    const zones = [0, 0, 0, 0, 0, 0];
    let lodged = 0, broken = 0, leanSum = 0;
    for (const c of this.clumps)
      for (const s of c.stems) {
        zones[s.zone]++;
        leanSum += s.theta;
        if (s.lodged) lodged++;
        if (s.broken) broken++;
      }
    const tot = this.totalStems || 1;
    return {
      t: this.time,
      lodgeRate: lodged / tot,
      brokenRate: broken / tot,
      meanLean: leanSum / tot,
      zones: zones.slice(1).map(z => z / tot),
      windNow: this.windNow,
    };
  }
  _record() { this.history.push(this._stats()); if (this.history.length > 4000) this.history.shift(); }
  _emitStats() { if (this.onStats) this.onStats(this._stats()); }

  /* --- 描画 ---------------------------------------------------------- */
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.draw();
  }

  _zoneColor(theta) {
    // 直立(緑) → 倒伏(赤)
    const t = Math.min(1, theta / 90);
    const hue = 130 - t * 130;            // 130(緑)→0(赤)
    const light = 38 + (1 - t) * 8;
    return `hsl(${hue}, 70%, ${light}%)`;
  }

  draw() {
    const ctx = this.ctx, p = this.params;
    const W = this.viewW, H = this.viewH;
    ctx.clearRect(0, 0, W, H);

    // 背景(土)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#3a2f23');
    grad.addColorStop(1, '#2c241b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const g = p.grid;
    const margin = 14;
    const cell = Math.min(W, H - 0) / g;
    const scale = cell;
    const offX = (W - cell * g) / 2;
    const offY = (H - cell * g) / 2;
    const toX = cx => offX + cx * scale;
    const toY = cy => offY + cy * scale;

    // 倒伏ヒートマップ的に株ごとの薄い円
    const stemLen = scale * 0.9 * (p.culmLength / 90);

    for (const c of this.clumps) {
      for (const s of c.stems) {
        const bx = toX(c.cx) + s.offX * scale * 0.04;
        const by = toY(c.cy) + s.offY * scale * 0.04;
        const proj = Math.sin(s.theta * DEG); // 上から見た倒れ込みの長さ
        const ex = bx + Math.cos(s.dir) * stemLen * proj;
        const ey = by + Math.sin(s.dir) * stemLen * proj;
        const col = this._zoneColor(s.theta);

        // 茎(倒れていれば線、直立ならほぼ点)
        if (proj > 0.04) {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(0.6, scale * 0.05);
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        // 穂(先端)
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(0.9, scale * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // 風向き矢印(右上)
    this._drawWindArrow(ctx, W - 56, 56, p.windDir, this.windNow);

    // 雨の演出
    if (p.rainfall > 0) this._drawRain(ctx, W, H, p.rainfall);
  }

  _drawWindArrow(ctx, x, y, dirDeg, speed) {
    const r = 30;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(dirDeg * DEG);
    const len = Math.min(r, 8 + speed * 1.4);
    const intensity = Math.min(1, speed / 25);
    ctx.strokeStyle = `hsl(${200 - intensity * 200}, 80%, 60%)`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(len - 7, -5);
    ctx.lineTo(len - 7, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawRain(ctx, W, H, rain) {
    const n = Math.floor(rain * 1.5);
    ctx.strokeStyle = 'rgba(150,190,230,0.35)';
    ctx.lineWidth = 1;
    const ang = this.params.windDir * DEG;
    const dx = Math.cos(ang) * 8, dy = Math.sin(ang) * 8 + 6;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * W);
      const y = ((this.time * 9 + i * 53) % H);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    }
  }
}

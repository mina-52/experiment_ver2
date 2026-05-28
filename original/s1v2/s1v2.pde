import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;


// 実験設定
String exp = "e1";
String pattern = "must";

int experiment_end = 100;
float step = 0.1;

// e1(茎強度)
float must = 0;
float sigmast = 5 / 3;

// e2(稈長)
int kan = 120;

// e3(稲株間隔)
int interval = 20;

// e4(茎数)
int m = 20;

// e5(天候シナリオ)
float ws0 = 0.0;  // 無風時の風速
float ws1 = 1.0;  // 突風時の風速

int calmFrames = 75;   // 無風フレーム数
int gustFrames = 50;   // 突風フレーム数
int cycleFrames = calmFrames + gustFrames;

float windStrength = 0.0;   // ★ 最初は無風

// e6(初期倒伏度)
int startzone = 1;


HashMap<String, Object> valueMap = new HashMap<>();

void initValueMap() {
  valueMap.put("must", must);
  valueMap.put("kan", kan);
  valueMap.put("iv", interval);
  valueMap.put("m", m);
  valueMap.put("ws", ws1);
  valueMap.put("sz", startzone);
}


// 描画用
boolean debugCircle = false; // 境界円を描画するか
boolean debugLines = false;  // 中心までの線を描画するか
boolean debugHo = true;      // 粒（稲）そのものを描くか


Ine v;
Kabu[][] kabus;
PVector[][] circleCenters;
FlowField flowFields; 

int innerRadius = 30;
int middleRadius = kan * 1/2;
int outerRadius =  int(kan * sqrt(3)/2);

// 5段階のリング境界（inner〜outerを5分割）
float r1 = innerRadius;
float r3 = middleRadius;
float r5 = outerRadius;
float r2 = (r1 + r3) * 0.5;
float r4 = (r3 + r5) * 0.5;

int gridSize = 30; //Kabuの縦横の数

PrintWriter csvWriter;
int frameCount = 0;
int experimentNumber = 1;
int trialNumber = 1;
int over18000count = 0;



public void settings() {
  int size = outerRadius*2+(gridSize-1)*interval;
  size(size, size, P2D);  // 画面サイズ
}



public void setup() {
  colorMode(HSB, 360, 100, 100);
  initValueMap();
  startExperiment();
}

void startExperiment() {
  startTrial();
}


void startTrial() {
  frameCount = 0;
  randomSeed(3);
  

  // フォルダ名と現在の日時を取得
  Object raw = valueMap.get(pattern);
  String formatted;

  switch (pattern) {
    case "must":
      formatted = String.format("%.1f", (float) raw);
      break;

    case "ws":
      formatted = String.format("%.1f", (float) raw);
      break;

    case "kan":
    case "iv":
    case "m":
    case "sz":
      formatted = String.valueOf((int) raw);
      break;

    default:
      formatted = raw.toString();
      break;
  }

  String folderPath1 = "../data/" + exp;
  String folderPath2 = folderPath1 + "/" + pattern + formatted;
  String folderName = exp + "_" + pattern + formatted;

  String datePattern = "yyyyMMdd_HHmm"; 
  SimpleDateFormat sdf = new SimpleDateFormat(datePattern);
  String dateStr = sdf.format(new Date());

  // 動的にファイル名を生成
  String csvFileName = folderName + "_x" + trialNumber + "_" + dateStr + ".csv";

  // CSVファイルを作成
  csvWriter = createWriter(folderPath2 + "/" + csvFileName);
  csvWriter.println("frame,zone1_ratio,zone2_ratio,zone3_ratio,zone4_ratio,zone5_ratio"); // ヘッダー行

  frameRate(9999);

  kabus = new Kabu[gridSize][gridSize];
  flowFields = new FlowField(20);
  circleCenters = new PVector[gridSize][gridSize];


  for (int i = 0; i < gridSize; i++) {
    for (int j = 0; j < gridSize; j++) {
      float cx = outerRadius + i * interval;
      float cy = outerRadius + j * interval;
      circleCenters[i][j] = new PVector(cx, cy);

      // 各セルにKabuを作成
      kabus[i][j] = new Kabu();
      for (int k = 0; k < m; k++) {
        float angle = random(TWO_PI); // ランダムな角度を取得
        float r = random(innerRadius); // ランダムな半径を取得
        float x = cx + cos(angle) * r; // 円周上のx座標
        float y = cy + sin(angle) * r; // 円周上のy座標
        kabus[i][j].addIne(new Ine(x, y));
      }
    }
  }
}

void draw() {
  frameCount++;

  background(255);

  // flowFields.display();

  int t = frameCount % cycleFrames;

  // 無風 → 突風 → 無風
  if (t < calmFrames) {
    windStrength = ws0;   // 無風
  } else {
    windStrength = ws1;   // 突風
  }

  // 弱風を残したい場合
  // windStrength = (t < calmFrames) ? 0.2 : 1.0;

  // すべてのKabuを更新
  for (int i = 0; i < gridSize; i++) {
  for (int j = 0; j < gridSize; j++) {
    PVector center = circleCenters[i][j];

    if (debugCircle) {
      noFill();

      // Zone1: r1 まで（内側）
      stroke(240, 100, 100);    // 青
      ellipse(center.x, center.y, r1 * 2, r1 * 2);

      // Zone2: r1〜r2
      stroke(180, 80, 100);     // 青緑
      ellipse(center.x, center.y, r2 * 2, r2 * 2);

      // Zone3: r2〜r3
      stroke(120, 80, 90);      // 緑
      ellipse(center.x, center.y, r3 * 2, r3 * 2);

      // Zone4: r3〜r4
      stroke(60, 90, 100);      // 黄
      ellipse(center.x, center.y, r4 * 2, r4 * 2);

      // Zone5: r4〜r5
      stroke(30, 100, 100);     // オレンジ
      ellipse(center.x, center.y, r5 * 2, r5 * 2);
    }

    // ★ run 側も r1〜r5 に合わせる
    kabus[i][j].run(center, r1, r2, r3, r4, r5,
                    flowFields, windStrength,  getNeighborFlocks(i, j));
  }
  }

  fill(0);
  textSize(14);
  text("frame=" + frameCount +
      "  wind=" + nf(windStrength,1,2), 20, 30);

  // ============================
  // ゾーンごとのカウント
  // ============================
  int[] zoneCounts = new int[6]; // 1〜5を使うので0はダミー

  for (int i = 0; i < gridSize; i++) {
    for (int j = 0; j < gridSize; j++) {
      for (Ine ine : kabus[i][j].ines) {
        if (ine.zone >= 1 && ine.zone <= 5) {
          zoneCounts[ine.zone]++;
        }
      }
    }
  }

  // 合計個体数
  float totalInes = 0;
  for (int z = 1; z <= 5; z++) {
    totalInes += zoneCounts[z];
  }
  if (totalInes == 0) return; // 念のため

  // ゾーンごとの割合
  float[] zoneRatios = new float[6];
  for (int z = 1; z <= 5; z++) {
    zoneRatios[z] = zoneCounts[z] / totalInes;
  }

  // （元の blueRatio 相当）内側ゾーンの合計（zone1+zone2）を使ってしきい値判定
  float innerRatio = (zoneCounts[1] + zoneCounts[2]) / totalInes;

  // ============================
  // 画面表示
  // ============================
  // 左上に背景の白い箱
  fill(255);
  noStroke();
  rect(0, 0, 180, 120);

  fill(0);
  textSize(14);
  text("Zone1: " + nf(zoneRatios[1] * 100, 1, 2) + "%", 10, 20);
  text("Zone2: " + nf(zoneRatios[2] * 100, 1, 2) + "%", 10, 40);
  text("Zone3: " + nf(zoneRatios[3] * 100, 1, 2) + "%", 10, 60);
  text("Zone4: " + nf(zoneRatios[4] * 100, 1, 2) + "%", 10, 80);
  text("Zone5: " + nf(zoneRatios[5] * 100, 1, 2) + "%", 10, 100);

  // ============================
  // CSVに書き込み（ゾーンごとの割合）
  // ============================
  csvWriter.println(
    frameCount + "," +
    zoneRatios[1] + "," +
    zoneRatios[2] + "," +
    zoneRatios[3] + "," +
    zoneRatios[4] + "," +
    zoneRatios[5]
  );
  csvWriter.flush();

  // ============================
  // 停止条件
  // 「内側ゾーン(zone1+zone2)の割合」が50%以下になったら終了
  // ============================
  if (innerRatio * 100 <= 50 || frameCount > 18000) {
    if (frameCount > 18000) {
      over18000count++;
    }
    println("innerRatio <= 50% or frameCount > 18000. Stopping the program.");
    nextTrial();
  }
}


// 周囲のKabuを取得するメソッド
ArrayList<Kabu> getNeighborFlocks(int x, int y) {
  ArrayList<Kabu> neighbors = new ArrayList<>();

  // -1, 0, 1 の相対位置で周囲を探索
  for (int dx = -3; dx <= 3; dx++) {
    for (int dy = -3; dy <= 3; dy++) {
      // 自分自身 (0, 0) の場合はスキップ
      if (dx == 0 && dy == 0) continue;

      int nx = x + dx;
      int ny = y + dy;

      // グリッド境界内であれば追加
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        neighbors.add(kabus[nx][ny]);
      }
    }
  }
  return neighbors;
}


void nextTrial() {
  csvWriter.close();  // 現在のCSVを閉じる
  trialNumber++;  // 試行回数を更新

  if (trialNumber > 100) {
    println("All trials completed.");
    nextExperiment();
  } else {
    startTrial();  // 新しい試行を開始
  }
}

void nextExperiment() {
  experimentNumber++;

  if (experimentNumber > experiment_end) {
    println("All experiments completed. Exiting.");
    exit();
  } else if (over18000count >= 50) {
    println("over18000count exceeds 80. Exiting.");
    exit();
  } else {
    over18000count = 0;
    trialNumber = 1;

    switch (pattern) {
      case "must":
        must += step;
        valueMap.put("must", must);
        break;
      case "kan":
        kan += step;
        valueMap.put("kan", kan);
        break;
      case "iv":
        interval += step;
        valueMap.put("iv", interval);
        break;
      case "ws":
        windStrength += step;
        valueMap.put("ws", windStrength);
        break;
      case "m":
        m += step;
        valueMap.put("m", m);
        break;
      case "sz":
        startzone += step;
        valueMap.put("sz", startzone);
        break;
      default:
          println("Unknown pattern: " + pattern);
          exit();
    }

    startTrial();
  }
}

void keyPressed() {
  if (key == '1') {
    debugCircle = !debugCircle; // 株領域の表示
  }

  if (key == '2') {
    debugLines = !debugLines; // 茎の表示
  }

  if (key == '3') {
    debugHo = !debugHo; // 穂の表示
  }
}
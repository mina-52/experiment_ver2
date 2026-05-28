// Ineクラス
class Ine {
  PVector position; // 現在の位置
  PVector velocity; // 速度
  PVector acceleration; // 加速度
  float maxspeed; // 最大速度
  float maxforce; // 最大の加速度
  float radius; // 穂の半径（描画用）

  int zone;      // 1〜5 のどのリングにいるか
  float strength;




  // コンストラクタ: 初期位置を設定
  Ine(float x, float y) {
    position = new PVector(x, y); // 初期位置を設定
    velocity = PVector.random2D(); // ランダムな方向の速度を初期化
    acceleration = new PVector(0, 0); // 初期加速度はゼロ
    maxspeed = 1; // 最大速度
    maxforce = 0.3; // 最大加速度
    radius = 7; // 穂の半径（描画用）
    strength = randomValue(must, sigmast); //　稲の強度

    zone = startzone;  // 初期ゾーン
  }


void render(PVector center) {

  // ====== ゾーンごとの色分け ======
  if (zone == 1) {
    fill(240, 100, 100);   // Zone1: 濃い青
  } else if (zone == 2) {
    fill(180, 80, 100);    // Zone2: 青緑
  } else if (zone == 3) {
    fill(120, 80, 90);     // Zone3: 緑
  } else if (zone == 4) {
    fill(60, 90, 100);     // Zone4: 黄
  } else if (zone == 5) {
    fill(30, 100, 100);    // Zone5: オレンジ
  } else {
    fill(0, 0, 50);        // 想定外はグレー
  }

  stroke(0, 0, 0);  // 黒枠
  strokeWeight(1);

  // 粒の描画
  if (debugHo) {
  pushMatrix();
  translate(position.x, position.y);
  ellipse(0, 0, radius, radius);
  popMatrix();
  }

  // 茎の描画
  if (debugLines) {
    if (zone == 1) {
      stroke(240, 100, 100);
    } else if (zone == 2) {
      stroke(180, 80, 100);
    } else if (zone == 3) {
      stroke(120, 80, 90);
    } else if (zone == 4) {
      stroke(60, 90, 100);
    } else if (zone == 5) {
      stroke(30, 100, 100);
    } else {
      stroke(0, 0, 0);
    }
    strokeWeight(1);
    line(position.x, position.y, center.x, center.y);
  }
  }


  float randomValue(float mu, float sigma) {
    float randomValue;

    do {
      randomValue = randomGaussian() * sigma + mu;
    } while (randomValue <= 0 || randomValue > 10); // 0より小さい、または10より大きい場合は再生成
    
    return randomValue;
  }



  void run(ArrayList<Ine> ines,
         PVector center,
         float r1, float r2, float r3, float r4, float r5,
         FlowField flowFields, float windStrength) {

  flock(ines);

  follow(flowFields, windStrength);
  stayInCircles(center, r1, r2, r3, r4, r5); // 境界内に留める
  update(); // 位置と速度を更新
  }


  // 群れの振る舞いを決定するメソッド
  void flock(ArrayList<Ine> ines) {
    PVector sep = separate(ines);   // 分離
    PVector ali = align(ines);      // 整列
    PVector coh = cohesion(ines);   // 凝集
    // 各力に重みを設定
    sep.mult(0.6);
    ali.mult(0.1);
    coh.mult(0.3);
    // 各力を加速度に適用
    applyForce(sep);
    applyForce(ali);
    applyForce(coh);
  }



  // 分離
  // 近くのIneを検出して、衝突を避けるように操縦
  PVector separate(ArrayList<Ine> ines) {
    float desiredseparation = radius * 1/2;  // 最小分離距離
    PVector steer = new PVector(0, 0);  // 分離方向のベクトル
    int count = 0;  // 近くのIneの数
    // 他のIneとの距離をチェック
    for (Ine other : ines) {
      float d = PVector.dist(position, other.position);  // 距離を計算
      // 自分以外で、指定した分離距離より近い場合
      if ((d > 0) && (d < desiredseparation)) {
        // 隣のIneから遠ざかるベクトルを計算
        PVector diff = PVector.sub(position, other.position);
        diff.normalize();  // 正規化
        diff.div(d);  // 距離で重み付け
        steer.add(diff);  // 方向を加算
        count++;  // 近くにいるIneの数をカウント
      }
    }
    // 平均を求める
    if (count > 0) {
      steer.div((float) count);  // Ine数で割って平均方向に
    }

    // ベクトルの大きさが0より大きければ
    if (steer.mag() > 0) {
      steer.normalize();  // 正規化
      steer.mult(maxspeed);  // 最大速度でスケーリング
      steer.sub(velocity);  // Steering = Desired - Velocity（目標方向 - 現在の速度）
      steer.limit(maxforce);  // 最大操縦力で制限
    }
    return steer;  // 分離力を返す
  }



  // 整列
  // 近くのIneの平均速度を計算
  PVector align(ArrayList<Ine> ines) {
    float neighbordist = 10;  // 近隣Ineの範囲
    PVector sum = new PVector(0, 0);  // 平均速度の合計
    int count = 0;  // 近くのIneの数
    for (Ine other : ines) {
      float d = PVector.dist(position, other.position);  // 距離を計算
      if ((d > 0) && (d < neighbordist)) {
        sum.add(other.velocity);  // 速度を加算
        count++;
      }
    }
    if (count > 0) {
      sum.div((float) count);  // 平均速度を計算
      sum.normalize();  // 正規化
      sum.mult(maxspeed);  // 最大速度でスケーリング
      PVector steer = PVector.sub(sum, velocity);  // Steering = Desired - Velocity
      steer.limit(maxforce);  // 最大操縦力で制限
      return steer;  // 整列力を返す
    } else {
      return new PVector(0, 0);  // 近くにIneがいなければ(0, 0)
    }
  }



  // 結束
  // 近くのIneの位置の平均に向かうベクトルを計算
  PVector cohesion(ArrayList<Ine> ines) {
    float neighbordist = 10;  // 近隣Ineの範囲
    PVector sum = new PVector(0, 0);  // 位置の合計
    int count = 0;  // 近くのIneの数
    for (Ine other : ines) {
      float d = PVector.dist(position, other.position);  // 距離を計算
      if ((d > 0) && (d < neighbordist)) {
        sum.add(other.position);  // 位置を加算
        count++;
      }
    }
    if (count > 0) {
      sum.div(count);  // 平均位置を計算
      return seek(sum);  // その位置に向かうように操縦
    } else {
      return new PVector(0, 0);  // 近くにIneがいなければ(0, 0)
    }
  }



  // 目標に向かう操縦力を計算するメソッド
  // STEER = DESIRED MINUS VELOCITY
  PVector seek(PVector target) {
    PVector desired = PVector.sub(target, position);  // 目標位置から現在位置へのベクトル
    // 目標ベクトルを正規化して最大速度でスケーリング
    desired.normalize();
    desired.mult(maxspeed);
    // Steering = Desired - Velocity（目標方向 - 現在の速度）
    PVector steer = PVector.sub(desired, velocity);
    steer.limit(maxforce);  // 最大操縦力で制限
    return steer;  // 計算した操縦力を返す
  }



  // レイノルズのフローフィールド追従アルゴリズムを実装
  void follow(FlowField flow, float windStrength) {
    // FlowField から方向ベクトルを取得
    PVector desiredflow = flow.lookup(position); 

    // ベクトルの大きさをランダムに調整
    desiredflow.setMag(maxspeed * windStrength / strength); // desiredflow ベクトルの大きさをランダムに変更

    // desiredflow ベクトルと現在の速度の差分から加速度を計算
    PVector steerflow = PVector.sub(desiredflow, velocity);
    steerflow.limit(maxforce); // 最大力を制限
    applyForce(steerflow); // 加速度を適用
  }
  


  // 外部から加速度を加えるメソッド
  void applyForce(PVector force) {
    acceleration.add(force); // 現在の加速度に力を加える
  }



  // 円の境界内に留める、または外側の円に移動する
  void stayInCircles(PVector center,
                   float r1, float r2, float r3, float r4, float r5) {

  // 加速度の閾値
  float border1 = 0.52; // zone1→2
  float border2 = 0.56; // zone2→3
  float border3 = 0.60; // zone3→4
  float border4 = 0.64; // zone4→5

  // 1) 加速度の大きさでゾーンを外側に“更新”
  float accMag = acceleration.mag();
  if (zone == 1 && accMag > border1) {
    zone = 2;
  } else if (zone == 2 && accMag > border2) {
    zone = 3;
  } else if (zone == 3 && accMag > border3) {
    zone = 4;
  } else if (zone == 4 && accMag > border4) {
    zone = 5;
  }
  // ※ 一度外に出たら内側には戻さない

  // 2) 現在の距離を計算
  PVector desired = null;
  PVector toCenter = PVector.sub(center, position);
  float distance = toCenter.mag();

  if (distance == 0) return;

  // 3) ゾーンごとの許容範囲に合わせて、内外に押し返す
  if (zone == 1) {
    // zone1: 0〜r1の中にいてほしい → 外に出すぎたら中心へ引き戻す
    if (distance > r1) {
      desired = toCenter;          // 中心方向
      }
    } else if (zone == 2) {
      // zone2: [r1, r2] にいてほしい
      if (distance < r1) {
        desired = toCenter.copy();   // 中心方向の反対へ押し出す
        desired.mult(-1);
      } else if (distance > r2) {
        desired = toCenter;          // 中心へ引き戻す
      }
    } else if (zone == 3) {
      // zone3: [r2, r3]
      if (distance < r2) {
        desired = toCenter.copy();
        desired.mult(-1);
      } else if (distance > r3) {
        desired = toCenter;
      }
    } else if (zone == 4) {
      // zone4: [r3, r4]
      if (distance < r3) {
        desired = toCenter.copy();
        desired.mult(-1);
      } else if (distance > r4) {
        desired = toCenter;
      }
    } else if (zone == 5) {
      // zone5: [r4, r5] くらいにいてほしい
      if (distance < r4) {
        desired = toCenter.copy();
        desired.mult(-1);
      } else if (distance > r5) {
        desired = toCenter;
      }
    }

    // 4) 必要なときだけステアをかける
    if (desired != null) {
      desired.normalize();
      desired.setMag(maxspeed);
      PVector steer = PVector.sub(desired, velocity);
      steer.limit(maxforce);

      velocity = new PVector(0, 0);
      acceleration = steer;
    }
  }




  // Ineの位置と速度を更新する
  void update() {
    velocity.add(acceleration); // 速度に加速度を加算
    velocity.limit(maxspeed); // 速度を最大値以下に制限
    position.add(velocity); // 位置を速度分だけ移動
    acceleration.mult(0); // 加速度をリセット（次フレーム用）
  }
}

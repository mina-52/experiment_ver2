// Kabuクラス: IneKabuを管理するクラス
class Kabu {
  ArrayList<Ine> ines; // Ineのリスト



  // コンストラクタ: 空のIneリストを作成
  Kabu() {
    ines = new ArrayList<Ine>();
  }



  // Ineをリストに追加するメソッド
  void addIne(Ine v) {
    ines.add(v); // Ineをリストに追加
  }



  void run(PVector center,
         float r1, float r2, float r3, float r4, float r5,
         FlowField flowFields, float windStrength, ArrayList<Kabu> allFlocks) {
    
    // 他のKabuからの影響を受ける
    influenceFromOtherFlocks(allFlocks, 5.0f); 

    // 自分のIne群を更新
    for (Ine v : ines) {
      v.run(ines, center, r1, r2, r3, r4, r5, flowFields, windStrength);
      v.render(center);
    }
  }


  void influenceFromOtherFlocks(ArrayList<Kabu> otherFlocks, float proximityThreshold) {
    PVector myAverageVector = calculateAverageVector(); // 自分のKabuの平均ベクトル
    float myVectorMagnitude = myAverageVector.mag(); // 自分のKabuの平均ベクトルの大きさ

    for (Kabu other : otherFlocks) {
      if (other == this) continue; // 自分自身を除外

      // 他のKabuとの距離を計算
      float distance = calculateDistanceToFlock(other);
      if (distance > proximityThreshold) continue; // 閾値より遠いKabuは無視

      PVector otherAverageVector = other.calculateAverageVector(); // 他のKabuの平均ベクトル
      float otherVectorMagnitude = otherAverageVector.mag(); // 他のKabuの平均ベクトルの大きさ

      // 大きい方のベクトルに近づける
      if (otherVectorMagnitude > myVectorMagnitude) {
        myAverageVector = otherAverageVector; // 他のKabuに近づける

        // 各Ineに新しいベクトルを反映
        for (Ine v : ines) {
          PVector influencedvec = myAverageVector.setMag(myAverageVector.mag()/v.strength);
          PVector kabusteer = v.seek(influencedvec);
          kabusteer.mult(1);
          v.applyForce(kabusteer);
        }
      }
    }
  }



  PVector calculateAverageVector() {
    PVector sum = new PVector(0, 0);
    for (Ine v : ines) {
      sum.add(v.velocity); // 各Ineの速度ベクトルを足し合わせる
    }
    if (ines.size() > 0) {
      sum.div(ines.size()); // 平均を取る
    }
    return sum;
  }



  // 他のKabuとの距離を計算する
  float calculateDistanceToFlock(Kabu other) {
      if (other.ines.isEmpty() || this.ines.isEmpty()) return Float.MAX_VALUE;

      // 自分のKabuの重心を計算
      PVector myCenter = calculateCenter();

      // 他のKabuの重心を計算
      PVector otherCenter = other.calculateCenter();

      // 距離を計算して返す
      return PVector.dist(myCenter, otherCenter);
  }



  // Kabuの重心を計算する
  PVector calculateCenter() {
      PVector sum = new PVector(0, 0);
      for (Ine v : ines) {
        sum.add(v.position); // Ineの位置を足し合わせる
      }
      if (!ines.isEmpty()) {
        sum.div(ines.size()); // 平均を取る
      }
      return sum;
  }
}
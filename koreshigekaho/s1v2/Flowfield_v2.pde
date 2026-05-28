// FlowFieldクラス
class FlowField {
  int cols, rows; // フローフィールドの列数と行数
  int resolution; // グリッド1セルのサイズ（px）
  PVector[][] field; // フィールドベクトルの2次元配列

  FlowField(int r) {
    resolution = r;
    cols = int(width / r);
    rows = int(height / r);
    field = new PVector[cols][rows];
    init(); // フィールドを初期化
  }


  // フローフィールドを初期化するメソッド
  void init() {
    // ノイズをリシードして、新しいフローフィールドを生成
    noiseSeed((int) random(10000));
    float xoff = 0; // ノイズのxオフセット
    for (int i = 0; i < cols; i++) {
      float yoff = 0; // ノイズのyオフセット
      for (int j = 0; j < rows; j++) {
        // ノイズ値を角度（theta）にマッピング
        float theta = map(noise(xoff, yoff), 0, 1, 0, TWO_PI);
        // 極座標（角度）から直交座標（x, y成分）へ変換してベクトルを作成
        field[i][j] = new PVector(cos(theta), sin(theta));
        yoff += 0.1; // y方向のノイズオフセットを増加
      }
      xoff += 0.1; // x方向のノイズオフセットを増加
    }
  }



  // 指定された位置のベクトルを取得
  PVector lookup(PVector position) {
    int col = int(constrain(position.x / resolution, 0, cols - 1));
    int row = int(constrain(position.y / resolution, 0, rows - 1));
    return field[col][row].get();
  }
}

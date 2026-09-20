-- さんすう・えいご・タイピング の きろく（1行＝1セット）
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,   -- クライアントが つくる ID。おなじ ものは いれない（そうしんの やりなおし よう）
  player_id   TEXT NOT NULL,      -- 人ごとの ID
  player_name TEXT NOT NULL,      -- よびな
  day         TEXT NOT NULL,      -- YYYY-MM-DD（といた 人の ローカル日付）
  ts          INTEGER NOT NULL,   -- といた ときの epoch ms
  mode        TEXT NOT NULL,      -- さんすう calc/word/clock/mix ・ えいご eigo/listen/eword/talk/abc ・ かんじ kanji/kj-* ・ タイピング ty-*
  level       INTEGER NOT NULL,   -- 1..3
  total       INTEGER NOT NULL,   -- もんだいすう
  correct     INTEGER NOT NULL,   -- せいかいすう
  detail      TEXT,               -- 1もんごとの JSON（なくても よい）
  received_at INTEGER NOT NULL    -- サーバーが うけとった epoch ms
);
CREATE INDEX IF NOT EXISTS idx_runs_day    ON runs (day);
CREATE INDEX IF NOT EXISTS idx_runs_player ON runs (player_id, day);

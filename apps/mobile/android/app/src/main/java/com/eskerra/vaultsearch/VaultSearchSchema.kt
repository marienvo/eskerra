package com.eskerra.vaultsearch

import android.database.sqlite.SQLiteDatabase

object VaultSearchSchema {
  const val SCHEMA_VERSION = 1

  const val KEY_SCHEMA_VERSION = "schema_version"
  const val KEY_BASE_URI_HASH = "base_uri_hash"
  const val KEY_VAULT_INSTANCE_ID = "vault_instance_id"
  const val KEY_LAST_FULL_BUILD_AT = "last_full_build_at"
  const val KEY_LAST_RECONCILED_AT = "last_reconciled_at"

  fun createTables(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(
        uri UNINDEXED,
        rel_path,
        title,
        filename,
        body,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS note_meta(
        uri TEXT PRIMARY KEY,
        rel_path TEXT NOT NULL,
        filename TEXT NOT NULL,
        title TEXT NOT NULL,
        size INTEGER NOT NULL,
        last_modified INTEGER NOT NULL
      );
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS index_meta(
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );
      """.trimIndent(),
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_note_meta_rel_path ON note_meta(rel_path);")
  }
}

package com.eskerra.vaultsearch

/** Bundled SQLite (requery) — platform SQLite does not compile the fts5 module. */
import io.requery.android.database.sqlite.SQLiteDatabase

object VaultSearchSchema {
  const val SCHEMA_VERSION = 3

  const val KEY_SCHEMA_VERSION = "schema_version"
  const val KEY_BASE_URI_HASH = "base_uri_hash"
  const val KEY_VAULT_INSTANCE_ID = "vault_instance_id"
  const val KEY_LAST_FULL_BUILD_AT = "last_full_build_at"
  /** Epoch ms when title/path rows are complete (search may return partial body hits until [KEY_LAST_FULL_BUILD_AT] > 0). */
  const val KEY_LAST_TITLES_AT = "last_titles_at"
  const val KEY_LAST_RECONCILED_AT = "last_reconciled_at"
  /** Epoch ms when [vault_markdown_notes] was last fully aligned with disk (rebuild or reconcile). */
  const val KEY_LAST_NOTES_REGISTRY_BUILD_AT = "last_notes_registry_build_at"

  /**
   * Apply additive schema upgrades in-place. Returns false when the on-disk schema cannot be upgraded
   * (caller should clear/rebuild index data).
   */
  fun migrate(db: SQLiteDatabase, fromVersion: Int, toVersion: Int): Boolean {
    if (fromVersion == toVersion) {
      return true
    }
    if (fromVersion == 0) {
      return true
    }
    if (fromVersion > toVersion) {
      return false
    }
    var v = fromVersion
    while (v < toVersion) {
      val next = v + 1
      when {
        v == 1 && next == 2 -> migrate1To2(db)
        v == 2 && next == 3 -> migrate2To3(db)
        else -> return false
      }
      v = next
    }
    return true
  }

  private fun migrate1To2(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS vault_markdown_notes(
        uri TEXT PRIMARY KEY,
        lookup_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        last_modified INTEGER NOT NULL
      );
      """.trimIndent(),
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_vault_markdown_notes_lookup_name ON vault_markdown_notes(lookup_name);",
    )
    backfillRegistryFromNoteMeta(db)
  }

  private fun migrate2To3(db: SQLiteDatabase) {
    backfillRegistryFromNoteMeta(db)
  }

  /**
   * Rebuilds [vault_markdown_notes] from [note_meta] after schema upgrades where the registry may be
   * empty or stale. Sets [KEY_LAST_NOTES_REGISTRY_BUILD_AT] so JS can trust the warm registry path.
   */
  internal fun backfillRegistryFromNoteMeta(db: SQLiteDatabase) {
    db.rawQuery(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_meta' LIMIT 1",
      null,
    ).use { c ->
      if (!c.moveToFirst()) {
        return
      }
    }
    db.rawQuery("SELECT uri, filename, last_modified FROM note_meta", null).use { c ->
      val iUri = c.getColumnIndexOrThrow("uri")
      val iName = c.getColumnIndexOrThrow("filename")
      val iLm = c.getColumnIndexOrThrow("last_modified")
      while (c.moveToNext()) {
        val name = c.getString(iName) ?: continue
        if (!VaultSearchRules.isEligibleMarkdown(name)) {
          continue
        }
        VaultMarkdownNotesRegistry.upsertRow(
          db,
          c.getString(iUri),
          name,
          c.getLong(iLm),
        )
      }
    }
    db.execSQL(
      "INSERT INTO index_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      arrayOf(
        KEY_LAST_NOTES_REGISTRY_BUILD_AT,
        System.currentTimeMillis().toString(),
      ),
    )
  }

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
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS vault_markdown_notes(
        uri TEXT PRIMARY KEY,
        lookup_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        last_modified INTEGER NOT NULL
      );
      """.trimIndent(),
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_vault_markdown_notes_lookup_name ON vault_markdown_notes(lookup_name);",
    )
  }
}

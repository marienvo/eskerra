package com.eskerra.vaultsearch

import androidx.documentfile.provider.DocumentFile
import io.requery.android.database.sqlite.SQLiteDatabase
import java.util.Locale

/**
 * Persisted registry of eligible vault markdown files (one row per note) for warm-start wiki index
 * and wikilink stem lookup. Kept in sync with FTS maintenance paths.
 */
internal object VaultMarkdownNotesRegistry {
  fun stemFromMarkdownFileName(fileName: String): String {
    return if (fileName.endsWith(".md", ignoreCase = true)) {
      fileName.dropLast(3)
    } else {
      fileName
    }
  }

  fun lookupNameForFileName(fileName: String): String =
    stemFromMarkdownFileName(fileName).lowercase(Locale.ROOT)

  fun upsertRow(db: SQLiteDatabase, uriKey: String, fileName: String, lastModified: Long) {
    val lookup = lookupNameForFileName(fileName)
    val display = stemFromMarkdownFileName(fileName)
    db.execSQL(
      """
      INSERT INTO vault_markdown_notes(uri, lookup_name, display_name, last_modified)
      VALUES(?,?,?,?)
      ON CONFLICT(uri) DO UPDATE SET
        lookup_name=excluded.lookup_name,
        display_name=excluded.display_name,
        last_modified=excluded.last_modified
      """.trimIndent(),
      arrayOf<Any?>(uriKey, lookup, display, lastModified),
    )
  }

  fun upsertFromDocument(db: SQLiteDatabase, doc: DocumentFile) {
    val name = doc.name ?: return
    if (!VaultSearchRules.isEligibleMarkdown(name)) {
      return
    }
    val uriKey = VaultPath.keyForIndex(doc.uri.toString())
    upsertRow(db, uriKey, name, doc.lastModified())
  }

  fun deleteByUriKey(db: SQLiteDatabase, uriKey: String) {
    db.execSQL("DELETE FROM vault_markdown_notes WHERE uri = ?", arrayOf(uriKey))
  }

  fun clearAll(db: SQLiteDatabase) {
    db.execSQL("DELETE FROM vault_markdown_notes")
  }
}

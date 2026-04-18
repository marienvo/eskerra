package com.eskerra.vaultsearch

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import io.requery.android.database.sqlite.SQLiteDatabase
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets

/**
 * Standalone vault reconcile for [VaultSearchReconcileWorker] (no RN bridge / no JS events).
 * Duplicates the DB/vault walk path from [VaultSearchModule] intentionally to avoid coupling.
 */
internal object VaultSearchWorkerReconcile {
  private const val MAX_FILE_BYTES = 512L * 1024L

  fun reconcile(context: Context, baseUri: String) {
    val canonical = VaultPath.canonicalizeUri(baseUri.trim())
    val file = VaultSearchPaths.indexSqliteFile(context, canonical)
    if (!file.exists()) {
      return
    }
    val db =
      SQLiteDatabase.openDatabase(
        file.absolutePath,
        null,
        SQLiteDatabase.OPEN_READWRITE,
        null,
      )
    db.enableWriteAheadLogging()
    db.execSQL("PRAGMA synchronous=NORMAL;")
    VaultSearchSchema.createTables(db)
    try {
      val root = documentFromUri(context, Uri.parse(canonical)) ?: return
      val onDisk = HashMap<String, FileSnapshot>()
      VaultSearchModule.walkEligibleMarkdown(root, canonical) { doc ->
        val len = doc.length()
        val lm = doc.lastModified()
        onDisk[VaultPath.keyForIndex(doc.uri.toString())] = FileSnapshot(len, lm)
      }
      val inDb = HashMap<String, FileSnapshot>()
      db.rawQuery("SELECT uri, rel_path, size, last_modified FROM note_meta", null).use { c ->
        val uriCol = c.getColumnIndexOrThrow("uri")
        val sizeCol = c.getColumnIndexOrThrow("size")
        val lmCol = c.getColumnIndexOrThrow("last_modified")
        while (c.moveToNext()) {
          inDb[c.getString(uriCol)] = FileSnapshot(c.getLong(sizeCol), c.getLong(lmCol))
        }
      }
      val diff = ReconcileDiffer.diff(inDb, onDisk)
      db.beginTransaction()
      try {
        for (uri in diff.removed) {
          deleteNoteByUri(db, uri)
        }
        for (uri in diff.added) {
          val doc = documentFromUri(context, Uri.parse(uri)) ?: continue
          upsertNoteDocument(db, canonical, doc, context.contentResolver)
        }
        for (uri in diff.updated) {
          val doc = documentFromUri(context, Uri.parse(uri)) ?: continue
          upsertNoteDocument(db, canonical, doc, context.contentResolver)
        }
        val recAt = System.currentTimeMillis()
        metaPut(db, VaultSearchSchema.KEY_LAST_RECONCILED_AT, recAt.toString())
        metaPut(db, VaultSearchSchema.KEY_LAST_NOTES_REGISTRY_BUILD_AT, recAt.toString())
        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }
    } finally {
      db.close()
    }
  }

  private fun documentFromUri(context: Context, uri: Uri): DocumentFile? {
    val path = uri.path
    return if (path != null && path.contains("/tree/", ignoreCase = true)) {
      DocumentFile.fromTreeUri(context, uri) ?: DocumentFile.fromSingleUri(context, uri)
    } else {
      DocumentFile.fromSingleUri(context, uri)
    }
  }

  private fun metaPut(db: SQLiteDatabase, key: String, value: String) {
    db.execSQL(
      "INSERT INTO index_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      arrayOf(key, value),
    )
  }

  private fun deleteNoteByUri(db: SQLiteDatabase, uriKey: String) {
    db.execSQL("DELETE FROM notes WHERE uri = ?", arrayOf(uriKey))
    db.execSQL("DELETE FROM note_meta WHERE uri = ?", arrayOf(uriKey))
    VaultMarkdownNotesRegistry.deleteByUriKey(db, uriKey)
  }

  private fun upsertNoteDocument(
    db: SQLiteDatabase,
    vaultRoot: String,
    doc: DocumentFile,
    resolver: ContentResolver,
  ) {
    val uri = doc.uri.toString()
    val key = VaultPath.keyForIndex(uri)
    val name = doc.name ?: return
    val rel = VaultPath.relativePath(vaultRoot, uri)
    val title = VaultPath.titleFromFileName(name)
    val len = doc.length()
    val body =
      if (len > MAX_FILE_BYTES) {
        ""
      } else {
        readUtf8(resolver, doc.uri, MAX_FILE_BYTES.toInt()) ?: ""
      }
    deleteNoteByUri(db, key)
    db.execSQL(
      "INSERT INTO notes(uri, rel_path, title, filename, body) VALUES(?,?,?,?,?)",
      arrayOf(key, rel, title, name, body),
    )
    db.execSQL(
      "INSERT INTO note_meta(uri, rel_path, filename, title, size, last_modified) VALUES(?,?,?,?,?,?)",
      arrayOf<Any?>(key, rel, name, title, len, doc.lastModified()),
    )
    VaultMarkdownNotesRegistry.upsertFromDocument(db, doc)
  }

  private fun readUtf8(resolver: ContentResolver, uri: Uri, maxBytes: Int): String? {
    return try {
      resolver.openInputStream(uri)?.use { input ->
        val buf = ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        var total = 0
        while (total < maxBytes) {
          val toRead = minOf(chunk.size, maxBytes - total)
          val n = input.read(chunk, 0, toRead)
          if (n <= 0) {
            break
          }
          buf.write(chunk, 0, n)
          total += n
        }
        if (input.read() != -1) {
          return null
        }
        String(buf.toByteArray(), StandardCharsets.UTF_8)
      }
    } catch (_: Exception) {
      null
    }
  }
}

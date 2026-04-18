package com.eskerra.vaultsearch

import android.content.ContentResolver
import android.net.Uri
/** Bundled SQLite (requery) — platform SQLite does not compile the fts5 module on any Android version. */
import io.requery.android.database.sqlite.SQLiteDatabase
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.jvm.JvmStatic
import java.util.concurrent.atomic.AtomicBoolean
/**
 * Full-vault FTS5 search index (SQLite WAL) with separate read lane for search.
 * Eligibility mirrors [packages/eskerra-core/src/vaultVisibility.ts].
 */
class VaultSearchModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val writeExecutor =
    Executors.newSingleThreadExecutor { r ->
      Thread(r, "EskerraVaultSearchWrite").apply { isDaemon = true }
    }
  private val searchExecutor =
    Executors.newSingleThreadExecutor { r ->
      Thread(r, "EskerraVaultSearchRead").apply { isDaemon = true }
    }

  private val lock = Any()
  private var activeBaseUri: String? = null
  private var dbPath: String? = null
  private var writeDb: SQLiteDatabase? = null
  private var readDb: SQLiteDatabase? = null
  private var vaultInstanceId: String? = null
  private val searchCancel = AtomicBoolean(false)
  private val writeCancel = AtomicBoolean(false)

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun open(baseUri: String, promise: Promise) {
    writeExecutor.execute {
      try {
        val map = openSync(baseUri.trim())
        reactContext.runOnUiQueueThread { promise.resolve(map) }
      } catch (e: Exception) {
        Log.e(TAG, "open failed", e)
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_SEARCH, e.message ?: "open failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun getIndexStatus(baseUri: String, promise: Promise) {
    writeExecutor.execute {
      try {
        val map = readIndexStatusSync(baseUri.trim())
        reactContext.runOnUiQueueThread { promise.resolve(map) }
      } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_SEARCH, e.message ?: "getIndexStatus failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun scheduleFullRebuild(baseUri: String, reason: String, promise: Promise) {
    writeExecutor.execute {
      try {
        scheduleFullRebuildSync(baseUri.trim(), reason)
        reactContext.runOnUiQueueThread { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "scheduleFullRebuild failed", e)
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_SEARCH, e.message ?: "rebuild failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun reconcile(baseUri: String, promise: Promise) {
    writeExecutor.execute {
      try {
        reconcileSync(baseUri.trim())
        reactContext.runOnUiQueueThread { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "reconcile failed", e)
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_SEARCH, e.message ?: "reconcile failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun touchPaths(baseUri: String, paths: ReadableArray, promise: Promise) {
    writeExecutor.execute {
      try {
        touchPathsSync(baseUri.trim(), paths)
        reactContext.runOnUiQueueThread { promise.resolve(null) }
      } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_SEARCH, e.message ?: "touchPaths failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun start(baseUri: String, searchId: String, query: String, promise: Promise) {
    searchExecutor.execute {
      try {
        startSearchSync(baseUri.trim(), searchId, query)
        reactContext.runOnUiQueueThread { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "start search failed", e)
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_SEARCH, e.message ?: "search failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    searchCancel.set(true)
    promise.resolve(null)
  }

  private fun emit(event: String, payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }

  private fun documentFromUri(uri: Uri): DocumentFile? {
    val path = uri.path
    return if (path != null && path.contains("/tree/", ignoreCase = true)) {
      DocumentFile.fromTreeUri(reactContext, uri) ?: DocumentFile.fromSingleUri(reactContext, uri)
    } else {
      DocumentFile.fromSingleUri(reactContext, uri)
    }
  }

  private fun dbFileForBase(base: String): java.io.File {
    val hash = VaultPath.baseUriHash(VaultPath.canonicalizeUri(base))
    val dir = java.io.File(reactContext.filesDir, "vault-search-index")
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return java.io.File(dir, "$hash.sqlite")
  }

  private fun closeDbs() {
    synchronized(lock) {
      try {
        readDb?.close()
      } catch (_: Exception) {
      }
      try {
        writeDb?.close()
      } catch (_: Exception) {
      }
      readDb = null
      writeDb = null
      dbPath = null
      activeBaseUri = null
      vaultInstanceId = null
    }
  }

  private fun ensureWriterOpen(path: String): SQLiteDatabase {
    synchronized(lock) {
      if (writeDb != null && writeDb!!.path == path && writeDb!!.isOpen) {
        return writeDb!!
      }
      writeDb?.close()
      val db =
        SQLiteDatabase.openDatabase(
          path,
          null,
          SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.OPEN_READWRITE,
          null,
        )
      db.enableWriteAheadLogging()
      /** [enableWriteAheadLogging] already sets journal_mode=WAL. Running `execSQL("PRAGMA journal_mode=WAL")`
       *  throws "Queries can be performed using SQLiteDatabase query or rawQuery methods only" because the
       *  PRAGMA returns a row and execSQL rejects result-producing statements. */
      db.execSQL("PRAGMA synchronous=NORMAL;")
      writeDb = db
      dbPath = path
      return db
    }
  }

  private fun reopenReader() {
    synchronized(lock) {
      val path = dbPath ?: return
      try {
        readDb?.close()
      } catch (_: Exception) {
      }
      readDb = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY, null)
    }
  }

  private fun metaGet(db: SQLiteDatabase, key: String): String? {
    db.rawQuery("SELECT v FROM index_meta WHERE k = ?", arrayOf(key)).use { c ->
      if (c.moveToFirst()) {
        return c.getString(0)
      }
    }
    return null
  }

  private fun metaPut(db: SQLiteDatabase, key: String, value: String) {
    db.execSQL(
      "INSERT INTO index_meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      arrayOf(key, value),
    )
  }

  private fun openSync(baseUri: String): WritableMap {
    val canonical = VaultPath.canonicalizeUri(baseUri)
    val file = dbFileForBase(canonical)
    val path = file.absolutePath
    synchronized(lock) {
      if (activeBaseUri != canonical) {
        closeDbs()
        activeBaseUri = canonical
      }
      val db = ensureWriterOpen(path)
      VaultSearchSchema.createTables(db)
      if (metaGet(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID) == null) {
        val newId = UUID.randomUUID().toString()
        vaultInstanceId = newId
        metaPut(db, VaultSearchSchema.KEY_SCHEMA_VERSION, VaultSearchSchema.SCHEMA_VERSION.toString())
        metaPut(db, VaultSearchSchema.KEY_BASE_URI_HASH, VaultPath.baseUriHash(canonical))
        metaPut(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID, newId)
        metaPut(db, VaultSearchSchema.KEY_LAST_FULL_BUILD_AT, "0")
        metaPut(db, VaultSearchSchema.KEY_LAST_RECONCILED_AT, "0")
        reopenReader()
        return buildStatusMap(newId, canonical, false, false, 0, 0L, 0L, VaultSearchSchema.SCHEMA_VERSION)
      }
      val schema = metaGet(db, VaultSearchSchema.KEY_SCHEMA_VERSION)?.toIntOrNull() ?: 0
      if (schema != VaultSearchSchema.SCHEMA_VERSION) {
        reopenReader()
        return buildStatusMap(
          metaGet(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID) ?: "",
          canonical,
          false,
          false,
          0,
          0L,
          0L,
          schema,
        )
      }
      vaultInstanceId = metaGet(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID) ?: run {
        val id = UUID.randomUUID().toString()
        metaPut(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID, id)
        id
      }
      reopenReader()
      val count = countNotes(db)
      val lastBuild = metaGet(db, VaultSearchSchema.KEY_LAST_FULL_BUILD_AT)?.toLongOrNull() ?: 0L
      val lastRec = metaGet(db, VaultSearchSchema.KEY_LAST_RECONCILED_AT)?.toLongOrNull() ?: 0L
      // Empty vault is still "ready" after a successful full build (lastBuild > 0).
      val ready = lastBuild > 0L
      return buildStatusMap(vaultInstanceId!!, canonical, ready, false, count, lastBuild, lastRec, schema)
    }
  }

  private fun readIndexStatusSync(baseUri: String): WritableMap {
    val canonical = VaultPath.canonicalizeUri(baseUri)
    val file = dbFileForBase(canonical)
    if (!file.exists()) {
      return buildStatusMap("", canonical, false, false, 0, 0L, 0L, 0)
    }
    val db = SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY, null)
    return db.use {
      val id = metaGet(it, VaultSearchSchema.KEY_VAULT_INSTANCE_ID) ?: ""
      val schema = metaGet(it, VaultSearchSchema.KEY_SCHEMA_VERSION)?.toIntOrNull() ?: 0
      val count = countNotes(it)
      val lastBuild = metaGet(it, VaultSearchSchema.KEY_LAST_FULL_BUILD_AT)?.toLongOrNull() ?: 0L
      val lastRec = metaGet(it, VaultSearchSchema.KEY_LAST_RECONCILED_AT)?.toLongOrNull() ?: 0L
      val ready = schema == VaultSearchSchema.SCHEMA_VERSION && lastBuild > 0L
      buildStatusMap(id, canonical, ready, false, count, lastBuild, lastRec, schema)
    }
  }

  private fun buildStatusMap(
    instanceId: String,
    baseUriForHash: String,
    indexReady: Boolean,
    isBuilding: Boolean,
    indexedNotes: Int,
    lastFullBuildAt: Long,
    lastReconciledAt: Long,
    reportedSchemaVersion: Int = VaultSearchSchema.SCHEMA_VERSION,
  ): WritableMap {
    val m = Arguments.createMap()
    m.putString("vaultInstanceId", instanceId)
    m.putString("baseUriHash", VaultPath.baseUriHash(VaultPath.canonicalizeUri(baseUriForHash)))
    m.putInt("schemaVersion", reportedSchemaVersion)
    m.putBoolean("indexReady", indexReady)
    m.putBoolean("isBuilding", isBuilding)
    m.putInt("indexedNotes", indexedNotes)
    m.putDouble("lastFullBuildAt", lastFullBuildAt.toDouble())
    m.putDouble("lastReconciledAt", lastReconciledAt.toDouble())
    return m
  }

  private fun countNotes(db: SQLiteDatabase): Int {
    db.rawQuery("SELECT COUNT(*) FROM note_meta", null).use { c ->
      if (c.moveToFirst()) {
        return c.getInt(0)
      }
    }
    return 0
  }

  private fun scheduleFullRebuildSync(baseUri: String, @Suppress("UNUSED_PARAMETER") reason: String) {
    val canonical = VaultPath.canonicalizeUri(baseUri)
    val file = dbFileForBase(canonical)
    writeCancel.set(false)
    emitIndexStatus(vaultInstanceId ?: "", "building", null, null, null, null, reason, null, null)
    val root =
      documentFromUri(Uri.parse(canonical))
        ?: run {
          Log.w(TAG, "rebuild failed: could not open vault root for $canonical")
          emitIndexStatus(vaultInstanceId ?: "", "error", null, null, null, null, reason, null, null)
          throw IllegalStateException("Could not open vault root")
        }
    if (!root.exists() || !root.isDirectory) {
      Log.w(TAG, "rebuild failed: vault root is not a directory for $canonical")
      emitIndexStatus(vaultInstanceId ?: "", "error", null, null, null, null, reason, null, null)
      throw IllegalStateException("Vault root is not a directory")
    }
    try {
      if (file.exists()) {
        file.delete()
      }
      synchronized(lock) {
        writeDb?.close()
        readDb?.close()
        writeDb = null
        readDb = null
        activeBaseUri = canonical
      }
      val path = file.absolutePath
      val db = ensureWriterOpen(path)
      var indexed = 0
      var skipped = 0
      db.beginTransaction()
      try {
        VaultSearchSchema.createTables(db)
        val newId = UUID.randomUUID().toString()
        vaultInstanceId = newId
        metaPut(db, VaultSearchSchema.KEY_SCHEMA_VERSION, VaultSearchSchema.SCHEMA_VERSION.toString())
        metaPut(db, VaultSearchSchema.KEY_BASE_URI_HASH, VaultPath.baseUriHash(canonical))
        metaPut(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID, newId)
        indexed = 0
        skipped = 0
        walkEligibleMarkdown(root, canonical) { doc ->
          if (writeCancel.get()) {
            return@walkEligibleMarkdown
          }
          try {
            upsertNoteDocument(db, canonical, doc, reactContext.contentResolver)
            indexed++
          } catch (e: Exception) {
            Log.w(TAG, "skip ${doc.uri}: ${e.message}")
            skipped++
          }
        }
        val now = System.currentTimeMillis()
        metaPut(db, VaultSearchSchema.KEY_LAST_FULL_BUILD_AT, now.toString())
        metaPut(db, VaultSearchSchema.KEY_LAST_RECONCILED_AT, now.toString())
        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }
      reopenReader()
      val nowMs = System.currentTimeMillis()
      emitIndexStatus(vaultInstanceId!!, "ready", indexed, null, null, null, "full-rebuild", skipped, nowMs)
    } catch (t: Throwable) {
      Log.w(TAG, "rebuild failed: ${t.message}", t)
      emitIndexStatus(vaultInstanceId ?: "", "error", null, null, null, null, reason, null, null)
      throw t
    }
  }

  private fun reconcileSync(baseUri: String) {
    val canonical = VaultPath.canonicalizeUri(baseUri)
    val file = dbFileForBase(canonical)
    if (!file.exists()) {
      return
    }
    val db = ensureWriterOpen(file.absolutePath)
    val root = documentFromUri(Uri.parse(canonical)) ?: return
    val onDisk = HashMap<String, FileSnapshot>()
    walkEligibleMarkdown(root, canonical) { doc ->
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
    var added = 0
    var updated = 0
    var removed = 0
    db.beginTransaction()
    try {
      for (uri in diff.removed) {
        deleteNoteByUri(db, uri)
        removed++
      }
      for (uri in diff.added) {
        val doc = documentFromUri(Uri.parse(uri)) ?: continue
        upsertNoteDocument(db, canonical, doc, reactContext.contentResolver)
        added++
      }
      for (uri in diff.updated) {
        val doc = documentFromUri(Uri.parse(uri)) ?: continue
        upsertNoteDocument(db, canonical, doc, reactContext.contentResolver)
        updated++
      }
      metaPut(db, VaultSearchSchema.KEY_LAST_RECONCILED_AT, System.currentTimeMillis().toString())
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    reopenReader()
    val recAt = metaGet(db, VaultSearchSchema.KEY_LAST_RECONCILED_AT)?.toLongOrNull()
    /** Always emit after reconcile so JS can refresh [lastReconciledAt] even when the diff is empty
     *  (otherwise the hook keeps treating the index as stale and re-walks the vault every session). */
    emitIndexStatus(
      metaGet(db, VaultSearchSchema.KEY_VAULT_INSTANCE_ID) ?: "",
      "ready",
      null,
      added,
      updated,
      removed,
      "reconcile",
      null,
      recAt,
    )
  }

  private fun emitIndexStatus(
    instanceId: String,
    status: String,
    indexedNotes: Int?,
    added: Int?,
    updated: Int?,
    removed: Int?,
    reason: String? = null,
    skippedNotes: Int? = null,
    lastReconciledAt: Long? = null,
  ) {
    val m = Arguments.createMap()
    m.putString("vaultInstanceId", instanceId)
    m.putString("status", status)
    indexedNotes?.let { m.putInt("indexedNotes", it) }
    added?.let { m.putInt("added", it) }
    updated?.let { m.putInt("updated", it) }
    removed?.let { m.putInt("removed", it) }
    reason?.let { m.putString("reason", it) }
    skippedNotes?.let { m.putInt("skippedNotes", it) }
    lastReconciledAt?.let { m.putDouble("lastReconciledAt", it.toDouble()) }
    emit("vault-search:index-status", m)
  }

  private fun touchPathsSync(baseUri: String, paths: ReadableArray) {
    val canonical = VaultPath.canonicalizeUri(baseUri)
    val file = dbFileForBase(canonical)
    if (!file.exists()) {
      return
    }
    val db = ensureWriterOpen(file.absolutePath)
    val resolver = reactContext.contentResolver
    for (i in 0 until paths.size()) {
      val p = paths.getString(i) ?: continue
      val doc = documentFromUri(Uri.parse(p)) ?: continue
      if (doc.isFile && VaultSearchRules.isEligibleMarkdown(doc.name ?: "")) {
        upsertNoteDocument(db, canonical, doc, resolver)
      } else {
        deleteNoteByUri(db, VaultPath.keyForIndex(p))
      }
    }
    reopenReader()
  }

  private fun deleteNoteByUri(db: SQLiteDatabase, uriKey: String) {
    db.execSQL("DELETE FROM notes WHERE uri = ?", arrayOf(uriKey))
    db.execSQL("DELETE FROM note_meta WHERE uri = ?", arrayOf(uriKey))
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
      arrayOf(key, rel, name, title, len, doc.lastModified()),
    )
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
    } catch (e: Exception) {
      Log.w(TAG, "readUtf8 failed", e)
      null
    }
  }

  private fun startSearchSync(baseUri: String, searchId: String, query: String) {
    searchCancel.set(false)
    val trimmed = query.trim()
    val instanceId = synchronized(lock) { vaultInstanceId }
    if (trimmed.isEmpty()) {
      emitDone(searchId, instanceId ?: "", false, emptyList(), 0, 0, 0, "idle", false, false)
      return
    }
    val tokens = Fts5Query.tokenizeQuery(trimmed)
    val matchExpr = Fts5Query.buildSafeMatch(tokens) ?: run {
      emitDone(searchId, instanceId ?: "", false, emptyList(), 0, 0, 0, "idle", false, false)
      return
    }
    val (rdb, readerMissing) =
      synchronized(lock) {
        val rd = readDb
        if (rd != null) {
          return@synchronized Pair(rd, null as VaultSearchReadiness.ReaderMissingProgress?)
        }
        val p = VaultSearchReadiness.progressWhenReadDbMissing(writeDb != null, activeBaseUri != null)
        Pair(null, p)
      }
    if (rdb == null) {
      val p = readerMissing!!
      emitDone(
        searchId,
        instanceId ?: "",
        false,
        emptyList(),
        0,
        0,
        0,
        p.indexStatus,
        p.indexReady,
        p.isBuilding,
      )
      return
    }
    val sql =
      "SELECT uri, rel_path, title, filename, body, bm25(notes) AS rk FROM notes WHERE notes MATCH ? ORDER BY rk LIMIT ?"
    val candidates = ArrayList<SearchCandidate>()
    rdb.rawQuery(sql, arrayOf(matchExpr, FTS_CANDIDATE_LIMIT.toString())).use { c ->
      val iUri = c.getColumnIndex("uri")
      val iRel = c.getColumnIndex("rel_path")
      val iTitle = c.getColumnIndex("title")
      val iFile = c.getColumnIndex("filename")
      val iBody = c.getColumnIndex("body")
      val iRk = c.getColumnIndex("rk")
      while (c.moveToNext()) {
        if (searchCancel.get()) {
          emitDone(searchId, instanceId ?: "", true, emptyList(), 0, 0, 0, "ready", true, false)
          return
        }
        candidates.add(
          SearchCandidate(
            c.getString(iUri) ?: "",
            c.getString(iRel) ?: "",
            c.getString(iTitle) ?: "",
            c.getString(iFile) ?: "",
            c.getString(iBody) ?: "",
            if (iRk >= 0) c.getDouble(iRk).toFloat() else 0f,
          ),
        )
      }
    }
    val ranked = candidates.map { SearchRanker.rank(it, trimmed, tokens) }.sortedByDescending { it.score }
    val initial = ranked.take(INITIAL_UPDATE_MAX)
    val finalList = ranked.take(VAULT_SEARCH_FINAL_MAX)
    emitUpdate(searchId, instanceId ?: "", initial, trimmed)
    emitDone(searchId, instanceId ?: "", false, finalList, finalList.size, 0, 0, "ready", true, false)
  }

  private fun emitUpdate(searchId: String, instanceId: String, rows: List<RankedNote>, @Suppress("UNUSED_PARAMETER") query: String) {
    val m = Arguments.createMap()
    m.putString("searchId", searchId)
    m.putString("vaultInstanceId", instanceId)
    val notes = Arguments.createArray()
    for (r in rows) {
      notes.pushMap(noteToMap(r))
    }
    m.putArray("notes", notes)
    val prog = Arguments.createMap()
    prog.putInt("scannedFiles", rows.size)
    prog.putInt("totalHits", rows.size)
    prog.putInt("skippedLargeFiles", 0)
    prog.putString("indexStatus", "ready")
    prog.putBoolean("indexReady", true)
    prog.putBoolean("isBuilding", false)
    prog.putInt("schemaVersion", VaultSearchSchema.SCHEMA_VERSION)
    m.putMap("progress", prog)
    emit("vault-search:update", m)
  }

  private fun emitDone(
    searchId: String,
    instanceId: String,
    cancelled: Boolean,
    rows: List<RankedNote>,
    totalHits: Int,
    skipped: Int,
    scanned: Int,
    indexStatus: String,
    indexReady: Boolean,
    isBuilding: Boolean,
  ) {
    val m = Arguments.createMap()
    m.putString("searchId", searchId)
    m.putString("vaultInstanceId", instanceId)
    m.putBoolean("cancelled", cancelled)
    val notes = Arguments.createArray()
    for (r in rows) {
      notes.pushMap(noteToMap(r))
    }
    m.putArray("notes", notes)
    val prog = Arguments.createMap()
    prog.putInt("scannedFiles", scanned)
    prog.putInt("totalHits", totalHits)
    prog.putInt("skippedLargeFiles", skipped)
    prog.putString("indexStatus", indexStatus)
    prog.putBoolean("indexReady", indexReady)
    prog.putBoolean("isBuilding", isBuilding)
    prog.putInt("schemaVersion", VaultSearchSchema.SCHEMA_VERSION)
    m.putMap("progress", prog)
    emit("vault-search:done", m)
  }

  private fun noteToMap(r: RankedNote): WritableMap {
    val m = Arguments.createMap()
    m.putString("uri", r.uri)
    m.putString("relativePath", r.relPath)
    m.putString("title", r.title)
    m.putString("bestField", r.bestField)
    m.putInt("matchCount", r.matchCount)
    m.putDouble("score", r.score.toDouble())
    val snippets = Arguments.createArray()
    if (r.snippetText != null) {
      val sn = Arguments.createMap()
      sn.putString("text", r.snippetText)
      if (r.snippetLine != null) {
        sn.putInt("lineNumber", r.snippetLine!!)
      } else {
        sn.putNull("lineNumber")
      }
      snippets.pushMap(sn)
    }
    m.putArray("snippets", snippets)
    return m
  }

  companion object {
    const val MODULE_NAME = "EskerraVaultSearch"
    private const val TAG = "EskerraVaultSearch"
    private const val E_VAULT_SEARCH = "E_VAULT_SEARCH"
    private const val MAX_FILE_BYTES = 512L * 1024L
    private const val FTS_CANDIDATE_LIMIT = 100
    private const val INITIAL_UPDATE_MAX = 50
    private const val VAULT_SEARCH_FINAL_MAX = 150

    @JvmStatic
    fun isIgnored(name: String): Boolean = VaultSearchRules.isIgnored(name)

    @JvmStatic
    fun isHardExcluded(name: String): Boolean = VaultSearchRules.isHardExcluded(name)

    @JvmStatic
    fun isEligibleMarkdown(name: String): Boolean = VaultSearchRules.isEligibleMarkdown(name)

    fun walkEligibleMarkdown(root: DocumentFile, vaultRoot: String, visitor: (DocumentFile) -> Unit) {
      val children = root.listFiles() ?: return
      for (child in children) {
        if (child == null) {
          continue
        }
        val name = child.name ?: continue
        if (VaultSearchRules.isIgnored(name)) {
          continue
        }
        if (child.isDirectory) {
          if (VaultSearchRules.isHardExcluded(name)) {
            continue
          }
          walkEligibleMarkdown(child, vaultRoot, visitor)
        } else if (child.isFile && VaultSearchRules.isEligibleMarkdown(name)) {
          visitor(child)
        }
      }
    }
  }
}

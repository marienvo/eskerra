package com.eskerra.vaultsearch

import android.content.ContentResolver
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
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
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

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
      db.execSQL("PRAGMA journal_mode=WAL;")
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

  private fun createSchema(db: SQLiteDatabase) {
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
      createSchema(db)
      if (metaGet(db, KEY_VAULT_INSTANCE_ID) == null) {
        val newId = UUID.randomUUID().toString()
        vaultInstanceId = newId
        metaPut(db, KEY_SCHEMA_VERSION, SCHEMA_VERSION.toString())
        metaPut(db, KEY_BASE_URI_HASH, VaultPath.baseUriHash(canonical))
        metaPut(db, KEY_VAULT_INSTANCE_ID, newId)
        metaPut(db, KEY_LAST_FULL_BUILD_AT, "0")
        metaPut(db, KEY_LAST_RECONCILED_AT, "0")
        reopenReader()
        return buildStatusMap(newId, canonical, false, false, 0, 0L, 0L, SCHEMA_VERSION)
      }
      val schema = metaGet(db, KEY_SCHEMA_VERSION)?.toIntOrNull() ?: 0
      if (schema != SCHEMA_VERSION) {
        reopenReader()
        return buildStatusMap(
          metaGet(db, KEY_VAULT_INSTANCE_ID) ?: "",
          canonical,
          false,
          false,
          0,
          0L,
          0L,
          schema,
        )
      }
      vaultInstanceId = metaGet(db, KEY_VAULT_INSTANCE_ID) ?: run {
        val id = UUID.randomUUID().toString()
        metaPut(db, KEY_VAULT_INSTANCE_ID, id)
        id
      }
      reopenReader()
      val count = countNotes(db)
      val lastBuild = metaGet(db, KEY_LAST_FULL_BUILD_AT)?.toLongOrNull() ?: 0L
      val lastRec = metaGet(db, KEY_LAST_RECONCILED_AT)?.toLongOrNull() ?: 0L
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
      val id = metaGet(it, KEY_VAULT_INSTANCE_ID) ?: ""
      val schema = metaGet(it, KEY_SCHEMA_VERSION)?.toIntOrNull() ?: 0
      val count = countNotes(it)
      val lastBuild = metaGet(it, KEY_LAST_FULL_BUILD_AT)?.toLongOrNull() ?: 0L
      val lastRec = metaGet(it, KEY_LAST_RECONCILED_AT)?.toLongOrNull() ?: 0L
      val ready = schema == SCHEMA_VERSION && lastBuild > 0L
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
    reportedSchemaVersion: Int = SCHEMA_VERSION,
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
    emitIndexStatus(vaultInstanceId ?: "", "building", null, null, null, null)
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
      createSchema(db)
      val newId = UUID.randomUUID().toString()
      vaultInstanceId = newId
      metaPut(db, KEY_SCHEMA_VERSION, SCHEMA_VERSION.toString())
      metaPut(db, KEY_BASE_URI_HASH, VaultPath.baseUriHash(canonical))
      metaPut(db, KEY_VAULT_INSTANCE_ID, newId)
      val root = documentFromUri(Uri.parse(canonical))
        ?: throw IllegalStateException("Could not open vault root")
      if (!root.exists() || !root.isDirectory) {
        throw IllegalStateException("Vault root is not a directory")
      }
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
      metaPut(db, KEY_LAST_FULL_BUILD_AT, now.toString())
      metaPut(db, KEY_LAST_RECONCILED_AT, now.toString())
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    reopenReader()
    emitIndexStatus(vaultInstanceId!!, "ready", indexed, null, null, null)
  }

  private fun reconcileSync(baseUri: String) {
    val canonical = VaultPath.canonicalizeUri(baseUri)
    val file = dbFileForBase(canonical)
    if (!file.exists()) {
      return
    }
    val db = ensureWriterOpen(file.absolutePath)
    val root = documentFromUri(Uri.parse(canonical)) ?: return
    val onDisk = HashMap<String, Pair<Long, Long>>()
    walkEligibleMarkdown(root, canonical) { doc ->
      val len = doc.length()
      val lm = doc.lastModified()
      onDisk[VaultPath.keyForIndex(doc.uri.toString())] = Pair(len, lm)
    }
    val inDb = HashMap<String, Triple<String, Long, Long>>()
    db.rawQuery("SELECT uri, rel_path, size, last_modified FROM note_meta", null).use { c ->
      val uriCol = c.getColumnIndexOrThrow("uri")
      val relCol = c.getColumnIndexOrThrow("rel_path")
      val sizeCol = c.getColumnIndexOrThrow("size")
      val lmCol = c.getColumnIndexOrThrow("last_modified")
      while (c.moveToNext()) {
        inDb[c.getString(uriCol)] = Triple(c.getString(relCol), c.getLong(sizeCol), c.getLong(lmCol))
      }
    }
    var added = 0
    var updated = 0
    var removed = 0
    db.beginTransaction()
    try {
      for ((uri, triple) in inDb) {
        if (!onDisk.containsKey(uri)) {
          deleteNoteByUri(db, uri)
          removed++
        }
      }
      for ((uri, pair) in onDisk) {
        val existing = inDb[uri]
        if (existing == null) {
          val doc = documentFromUri(Uri.parse(uri)) ?: continue
          upsertNoteDocument(db, canonical, doc, reactContext.contentResolver)
          added++
        } else if (existing.second != pair.first || existing.third != pair.second) {
          val doc = documentFromUri(Uri.parse(uri)) ?: continue
          upsertNoteDocument(db, canonical, doc, reactContext.contentResolver)
          updated++
        }
      }
      metaPut(db, KEY_LAST_RECONCILED_AT, System.currentTimeMillis().toString())
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    reopenReader()
    if (added + updated + removed > 0) {
      emitIndexStatus(metaGet(db, KEY_VAULT_INSTANCE_ID) ?: "", "ready", null, added, updated, removed)
    }
  }

  private fun emitIndexStatus(
    instanceId: String,
    status: String,
    indexedNotes: Int?,
    added: Int?,
    updated: Int?,
    removed: Int?,
  ) {
    val m = Arguments.createMap()
    m.putString("vaultInstanceId", instanceId)
    m.putString("status", status)
    indexedNotes?.let { m.putInt("indexedNotes", it) }
    added?.let { m.putInt("added", it) }
    updated?.let { m.putInt("updated", it) }
    removed?.let { m.putInt("removed", it) }
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
      if (doc.isFile && isEligibleMarkdown(doc.name ?: "")) {
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
      emitDone(searchId, instanceId ?: "", false, emptyList(), 0, 0, 0, "idle", false)
      return
    }
    val tokens = Fts5Query.tokenizeQuery(trimmed)
    val matchExpr = Fts5Query.buildSafeMatch(tokens) ?: run {
      emitDone(searchId, instanceId ?: "", false, emptyList(), 0, 0, 0, "idle", false)
      return
    }
    val rdb = synchronized(lock) { readDb } ?: run {
      emitDone(searchId, instanceId ?: "", false, emptyList(), 0, 0, 0, "idle", false)
      return
    }
    val sql =
      "SELECT uri, rel_path, title, filename, body, bm25(notes) AS rk FROM notes WHERE notes MATCH ? ORDER BY rk LIMIT ?"
    val candidates = ArrayList<Candidate>()
    rdb.rawQuery(sql, arrayOf(matchExpr, FTS_CANDIDATE_LIMIT.toString())).use { c ->
      val iUri = c.getColumnIndex("uri")
      val iRel = c.getColumnIndex("rel_path")
      val iTitle = c.getColumnIndex("title")
      val iFile = c.getColumnIndex("filename")
      val iBody = c.getColumnIndex("body")
      val iRk = c.getColumnIndex("rk")
      while (c.moveToNext()) {
        if (searchCancel.get()) {
          emitDone(searchId, instanceId ?: "", true, emptyList(), 0, 0, 0, "ready", true)
          return
        }
        candidates.add(
          Candidate(
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
    val ranked = candidates.map { rankCandidate(it, trimmed, tokens) }.sortedByDescending { it.score }
    val initial = ranked.take(INITIAL_UPDATE_MAX)
    val finalList = ranked.take(VAULT_SEARCH_FINAL_MAX)
    emitUpdate(searchId, instanceId ?: "", initial, trimmed)
    emitDone(searchId, instanceId ?: "", false, finalList, finalList.size, 0, 0, "ready", true)
  }

  private data class Candidate(
    val uri: String,
    val relPath: String,
    val title: String,
    val filename: String,
    val body: String,
    val bm25: Float,
  )

  private data class Ranked(
    val uri: String,
    val relPath: String,
    val title: String,
    val bestField: String,
    val matchCount: Int,
    val score: Float,
    val snippetText: String?,
    val snippetLine: Int?,
  )

  private fun rankCandidate(c: Candidate, fullQuery: String, tokens: List<String>): Ranked {
    val qLower = fullQuery.lowercase()
    val titleL = c.title.lowercase()
    val fileL = c.filename.lowercase()
    val relL = c.relPath.lowercase()
    val bodyL = c.body.lowercase()
    var tier = 0f
    var best = "body"
    if (titleL.contains(qLower) || relL.contains(qLower)) {
      tier = 40_000f
      best = if (titleL.contains(qLower)) "title" else "path"
    } else if (hasPrefixHit(titleL, fileL, relL, tokens)) {
      tier = 25_000f
      best = "path"
    } else if (fullQuery.length >= 4 && fuzzyTitlePathHit(titleL, fileL, relL, tokens)) {
      tier = 12_000f
      best = "path"
    }
    val snippet = firstBodySnippetLine(c.body, qLower, tokens)
    val mc = if (snippet != null) 1 else 1
    return Ranked(
      c.uri,
      c.relPath,
      c.title,
      best,
      mc,
      tier + c.bm25 * 0.02f,
      snippet?.second,
      snippet?.first,
    )
  }

  private fun hasPrefixHit(titleL: String, fileL: String, relL: String, tokens: List<String>): Boolean {
    for (t in tokens) {
      if (t.length < 3) {
        continue
      }
      val tl = t.lowercase()
      if (titleL.split(Regex("\\s+")).any { w -> w.startsWith(tl) }) {
        return true
      }
      if (fileL.split(Regex("\\s+|[/\\\\]")).any { w -> w.startsWith(tl) }) {
        return true
      }
      if (relL.split(Regex("\\s+|[/\\\\]")).any { w -> w.startsWith(tl) }) {
        return true
      }
    }
    return false
  }

  private fun fuzzyTitlePathHit(titleL: String, fileL: String, relL: String, tokens: List<String>): Boolean {
    val hay = "$titleL $fileL $relL"
    for (t in tokens) {
      if (t.length < 4) {
        continue
      }
      val tl = t.lowercase()
      val maxD = maxEditDistanceForQuery(tl.length)
      for (w in hay.split(Regex("\\s+|[/\\\\._-]+"))) {
        if (w.isEmpty()) {
          continue
        }
        val wTrim = w.trim().lowercase()
        if (abs(wTrim.length - tl.length) > maxD) {
          continue
        }
        if (boundedLevenshtein(wTrim, tl, maxD) != null) {
          return true
        }
      }
    }
    return false
  }

  private fun maxEditDistanceForQuery(len: Int): Int =
    when {
      len <= 2 -> 0
      len <= 5 -> 1
      else -> 2
    }

  private fun boundedLevenshtein(a: String, b: String, maxDist: Int): Int? {
    val n = a.length
    val m = b.length
    if (abs(n - m) > maxDist) {
      return null
    }
    var prev = IntArray(m + 1) { it }
    var curr = IntArray(m + 1)
    for (i in 1..n) {
      curr[0] = i
      for (j in 1..m) {
        val cost = if (a[i - 1] == b[j - 1]) 0 else 1
        curr[j] = minOf(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      }
      val tmp = prev
      prev = curr
      curr = tmp
    }
    val d = prev[m]
    return if (d <= maxDist) d else null
  }

  /** Returns (1-based line, text) or null. */
  private fun firstBodySnippetLine(body: String, fullLower: String, tokens: List<String>): Pair<Int, String>? {
    var lineNo = 0
    for (line in body.lineSequence()) {
      lineNo++
      val ll = line.lowercase()
      if (fullLower.isNotEmpty() && ll.contains(fullLower)) {
        return Pair(lineNo, line.trim().take(SNIPPET_MAX_CHARS))
      }
      for (t in tokens) {
        if (t.length >= 3 && ll.contains(t.lowercase())) {
          return Pair(lineNo, line.trim().take(SNIPPET_MAX_CHARS))
        }
      }
    }
    return null
  }

  private fun emitUpdate(searchId: String, instanceId: String, rows: List<Ranked>, @Suppress("UNUSED_PARAMETER") query: String) {
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
    prog.putInt("schemaVersion", SCHEMA_VERSION)
    m.putMap("progress", prog)
    emit("vault-search:update", m)
  }

  private fun emitDone(
    searchId: String,
    instanceId: String,
    cancelled: Boolean,
    rows: List<Ranked>,
    totalHits: Int,
    skipped: Int,
    scanned: Int,
    indexStatus: String,
    indexReady: Boolean,
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
    prog.putBoolean("isBuilding", false)
    prog.putInt("schemaVersion", SCHEMA_VERSION)
    m.putMap("progress", prog)
    emit("vault-search:done", m)
  }

  private fun noteToMap(r: Ranked): WritableMap {
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
    private const val SCHEMA_VERSION = 1
    private const val MAX_FILE_BYTES = 512L * 1024L
    private const val SNIPPET_MAX_CHARS = 160
    private const val FTS_CANDIDATE_LIMIT = 100
    private const val INITIAL_UPDATE_MAX = 50
    private const val VAULT_SEARCH_FINAL_MAX = 150
    private const val KEY_SCHEMA_VERSION = "schema_version"
    private const val KEY_BASE_URI_HASH = "base_uri_hash"
    private const val KEY_VAULT_INSTANCE_ID = "vault_instance_id"
    private const val KEY_LAST_FULL_BUILD_AT = "last_full_build_at"
    private const val KEY_LAST_RECONCILED_AT = "last_reconciled_at"

    private val HARD_EXCLUDED = setOf("Assets", "Excalidraw", "Scripts", "Templates")
    private const val SYNC_MARKER = "sync-conflict"

    fun isIgnored(name: String): Boolean =
      name.startsWith('.') || name.startsWith('_')

    fun isHardExcluded(name: String): Boolean = HARD_EXCLUDED.contains(name)

    fun isEligibleMarkdown(name: String): Boolean {
      if (!name.endsWith(".md", ignoreCase = true)) {
        return false
      }
      if (name.lowercase().contains(SYNC_MARKER)) {
        return false
      }
      if (isIgnored(name)) {
        return false
      }
      return true
    }

    fun walkEligibleMarkdown(root: DocumentFile, vaultRoot: String, visitor: (DocumentFile) -> Unit) {
      val children = root.listFiles() ?: return
      for (child in children) {
        if (child == null) {
          continue
        }
        val name = child.name ?: continue
        if (isIgnored(name)) {
          continue
        }
        if (child.isDirectory) {
          if (isHardExcluded(name)) {
            continue
          }
          walkEligibleMarkdown(child, vaultRoot, visitor)
        } else if (child.isFile && isEligibleMarkdown(name)) {
          visitor(child)
        }
      }
    }
  }
}

package com.notebox

import android.content.ContentResolver
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.text.Collator
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Lists .md files under a SAF directory URI on a background thread, matching JS filter/sort in
 * noteboxStorage (markdown only, exclude sync-conflict names, sort by lastModified desc).
 *
 * Session prepare batches settings init/read, Inbox listing, and General/Inbox.md sync in one
 * executor job to cut bridge round-trips and duplicate SAF work on cold start.
 */
class VaultListingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  /**
   * One executor for all SAF/DocumentFile work so parallel prepare + listings do not convoy on a
   * cold StorageAccessProvider.
   */
  private val safExecutor =
    Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "NoteboxSaf").apply { isDaemon = true }
    }

  override fun getName(): String = MODULE_NAME

  /**
   * SAF vault roots from the folder picker are **tree** URIs (`…/tree/…`). Using
   * [DocumentFile.fromSingleUri] on those can stall or misbehave; [DocumentFile.fromTreeUri] is
   * the supported API for the same string.
   */
  private fun documentFileFromStorageUri(uri: Uri): DocumentFile? {
    val path = uri.path
    return if (path != null && path.contains("/tree/", ignoreCase = true)) {
      DocumentFile.fromTreeUri(reactContext, uri) ?: DocumentFile.fromSingleUri(reactContext, uri)
    } else {
      DocumentFile.fromSingleUri(reactContext, uri)
    }
  }

  /**
   * Ensures `.notebox/settings-shared.json` (or legacy `settings.json` with migration to shared),
   * ensures `Inbox` and `General`, lists Inbox markdown,
   * writes `General/Inbox.md` (same body as `buildInboxMarkdownIndexContent` in `@notebox/core`),
   * and returns a map: `settings` (UTF-8 JSON string) and `inboxNotes` (array of uri/name/lastModified).
   */
  @ReactMethod
  fun prepareNoteboxSession(baseUri: String, promise: Promise) {
    safExecutor.execute {
      try {
        val result = prepareNoteboxSessionSync(baseUri.trim())
        reactContext.runOnUiQueueThread { promise.resolve(result) }
      } catch (e: Exception) {
        Log.e(TAG, "prepareNoteboxSession failed", e)
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_PREPARE, e.message ?: "Vault session prepare failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun listMarkdownFiles(directoryUri: String, promise: Promise) {
    safExecutor.execute {
      try {
        val result = buildMarkdownListing(directoryUri)
        reactContext.runOnUiQueueThread { promise.resolve(result) }
      } catch (e: Exception) {
        Log.e(TAG, "listMarkdownFiles failed", e)
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_LISTING, e.message ?: "Vault listing failed", e)
        }
      }
    }
  }

  private fun buildMarkdownListing(directoryUri: String): WritableArray {
    val dir = resolveDirectoryForListing(directoryUri.trim())
    val rows = collectMarkdownRows(dir)
    return rowsToWritableArray(rows)
  }

  /**
   * JS passes tree child paths as string concat (`vaultRoot/Inbox`). Prefer resolving via the
   * parent tree URI + [DocumentFile.findFile]/[DocumentFile.listFiles] (same as
   * [prepareNoteboxSessionSync]); fall back to opening the full child URI via [documentFileFromStorageUri].
   */
  private fun resolveDirectoryForListing(directoryUriTrimmed: String): DocumentFile {
    val withoutSlash = directoryUriTrimmed.trimEnd('/')
    val pairs =
      listOf(
        "/$INBOX_DIR_NAME" to INBOX_DIR_NAME,
        "/$GENERAL_DIR_NAME" to GENERAL_DIR_NAME,
      )
    for ((suffix, displayName) in pairs) {
      if (withoutSlash.endsWith(suffix, ignoreCase = true)) {
        val parentUriString = withoutSlash.dropLast(suffix.length)
        if (parentUriString.isEmpty()) {
          continue
        }
        val parentUri = Uri.parse(parentUriString)
        val parent = documentFileFromStorageUri(parentUri) ?: continue
        if (!parent.exists() || !parent.isDirectory) {
          continue
        }
        val byFind = parent.findFile(displayName)
        if (byFind != null && byFind.exists() && byFind.isDirectory) {
          return byFind
        }
        val children = parent.listFiles() ?: continue
        for (child in children) {
          if (child != null &&
            child.isDirectory &&
            displayName.equals(child.name, ignoreCase = true)
          ) {
            return child
          }
        }
      }
    }
    val uri = Uri.parse(directoryUriTrimmed)
    val direct = documentFileFromStorageUri(uri)
    if (direct != null && direct.exists() && direct.isDirectory) {
      return direct
    }
    throw IllegalStateException(
      "Could not resolve listing directory (parent enum and direct child failed); use JS fallback.",
    )
  }

  private data class MarkdownRow(val uri: String, val name: String, val lastModified: Long)

  private fun collectMarkdownRows(dir: DocumentFile): List<MarkdownRow> {
    val rows = ArrayList<MarkdownRow>()
    val children =
      dir.listFiles()
        ?: throw IllegalStateException(
          "DocumentFile.listFiles returned null; use JS listing fallback.",
        )
    children.forEach { child ->
      if (child == null || !child.isFile) {
        return@forEach
      }
      val name = child.name ?: return@forEach
      if (!name.endsWith(MARKDOWN_SUFFIX, ignoreCase = true)) {
        return@forEach
      }
      if (name.lowercase().contains(SYNC_CONFLICT_MARKER)) {
        return@forEach
      }
      val lm = child.lastModified()
      rows.add(MarkdownRow(uri = child.uri.toString(), name = name, lastModified = lm))
    }
    rows.sortWith { a, b -> compareDescendingLastModified(a.lastModified, b.lastModified) }
    return rows
  }

  private fun rowsToWritableArray(rows: List<MarkdownRow>): WritableArray {
    val out = Arguments.createArray()
    for (row in rows) {
      val map = Arguments.createMap()
      map.putString("uri", row.uri)
      map.putString("name", row.name)
      map.putDouble("lastModified", row.lastModified.toDouble())
      out.pushMap(map)
    }
    return out
  }

  /**
   * Like [rowsToWritableArray] but adds UTF-8 `content` when the file is at most
   * [INBOX_NOTE_CONTENT_MAX_BYTES]; larger or unreadable files omit `content` so JS falls back to
   * [readFile].
   */
  private fun prepareRowsToWritableArray(
    rows: List<MarkdownRow>,
    resolver: ContentResolver,
  ): WritableArray {
    val out = Arguments.createArray()
    for (row in rows) {
      val map = Arguments.createMap()
      map.putString("uri", row.uri)
      map.putString("name", row.name)
      map.putDouble("lastModified", row.lastModified.toDouble())
      val body = readInboxMarkdownContentForPrepare(resolver, row.uri)
      if (body != null) {
        map.putString("content", body)
      }
      out.pushMap(map)
    }
    return out
  }

  /**
   * Returns full UTF-8 text, or null if skipped (too large), empty file as "", or read failure.
   */
  private fun readInboxMarkdownContentForPrepare(resolver: ContentResolver, uriString: String): String? {
    val uri = Uri.parse(uriString)
    val doc = documentFileFromStorageUri(uri)
    val len = doc?.length() ?: -1L
    if (len > INBOX_NOTE_CONTENT_MAX_BYTES) {
      return null
    }
    return try {
      resolver.openInputStream(uri)?.use { input ->
        when {
          len == 0L -> ""
          len > 0L && len <= INBOX_NOTE_CONTENT_MAX_BYTES -> {
            val bytes = ByteArray(len.toInt())
            var read = 0
            while (read < len) {
              val n = input.read(bytes, read, (len - read).toInt())
              if (n < 0) {
                break
              }
              read += n
            }
            String(bytes, StandardCharsets.UTF_8)
          }
          else -> {
            val buffer = ByteArrayOutputStream()
            val chunk = ByteArray(8192)
            var total = 0
            while (total < INBOX_NOTE_CONTENT_MAX_BYTES) {
              val toRead = minOf(chunk.size, INBOX_NOTE_CONTENT_MAX_BYTES - total)
              val n = input.read(chunk, 0, toRead)
              if (n <= 0) {
                break
              }
              buffer.write(chunk, 0, n)
              total += n
            }
            if (input.read() != -1) {
              return null
            }
            String(buffer.toByteArray(), StandardCharsets.UTF_8)
          }
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "readInboxMarkdownContentForPrepare failed for $uriString", e)
      null
    }
  }

  private fun compareDescendingLastModified(left: Long, right: Long): Int {
    val l = if (left > 0L) left else 0L
    val r = if (right > 0L) right else 0L
    return r.compareTo(l)
  }

  /** Matches JS `generalDirectoryUri + "/" + fileName` for tree document URIs. */
  private fun childDocumentUri(parentUri: Uri, displayName: String): Uri {
    val base = parentUri.toString().trimEnd('/')
    return Uri.parse("$base/$displayName")
  }

  /**
   * Resolves [displayName] under [root] using a single [root.listFiles] pass when possible,
   * then [createDirectory] if missing. Updates [rootChildrenByName] when creating.
   */
  private fun resolveOrCreateRootSubdir(
    root: DocumentFile,
    displayName: String,
    rootChildrenByName: MutableMap<String, DocumentFile>,
  ): DocumentFile {
    var dir = rootChildrenByName[displayName]
    if (dir != null && dir.exists()) {
      if (!dir.isDirectory) {
        throw IllegalStateException("$displayName exists but is not a directory.")
      }
      return dir
    }
    dir =
      root.createDirectory(displayName)
        ?: throw IllegalStateException("Could not create $displayName directory.")
    rootChildrenByName[displayName] = dir
    return dir
  }

  private fun prepareNoteboxSessionSync(baseUriTrimmed: String): WritableMap {
    val uri = Uri.parse(baseUriTrimmed)
    val root =
      documentFileFromStorageUri(uri)
        ?: throw IllegalStateException("DocumentFile could not open vault root (tree/single).")
    if (!root.exists()) {
      throw IllegalStateException("Vault root is missing.")
    }
    if (!root.isDirectory) {
      throw IllegalStateException("Vault root URI is not a directory.")
    }

    val rootChildren =
      root.listFiles()
        ?: throw IllegalStateException("Vault root listFiles returned null.")
    val rootChildrenByName = HashMap<String, DocumentFile>()
    for (child in rootChildren) {
      if (child == null) {
        continue
      }
      val name = child.name ?: continue
      rootChildrenByName[name] = child
    }

    var notebox = resolveOrCreateRootSubdir(root, NOTEBOX_DIR_NAME, rootChildrenByName)
    if (!notebox.isDirectory) {
      throw IllegalStateException(".notebox exists but is not a directory.")
    }

    val sharedDoc = notebox.findFile(SETTINGS_SHARED_FILE_NAME)
    val legacyDoc = notebox.findFile(SETTINGS_LEGACY_FILE_NAME)
    val resolver = reactContext.contentResolver

    val pickShared =
      sharedDoc != null && sharedDoc.exists() && sharedDoc.isFile
    val pickLegacy =
      legacyDoc != null && legacyDoc.exists() && legacyDoc.isFile

    val raw: String =
      when {
        pickShared -> {
          resolver.openInputStream(sharedDoc!!.uri)?.use { input ->
              input.bufferedReader(StandardCharsets.UTF_8).readText()
            }
            ?: throw IllegalStateException("Could not read settings-shared.json.")
        }
        pickLegacy -> {
          val legacyRaw =
            resolver.openInputStream(legacyDoc!!.uri)?.use { input ->
              input.bufferedReader(StandardCharsets.UTF_8).readText()
            }
              ?: throw IllegalStateException("Could not read legacy settings.json.")
          var sharedTarget = notebox.findFile(SETTINGS_SHARED_FILE_NAME)
          if (sharedTarget == null || !sharedTarget.exists()) {
            sharedTarget =
              notebox.createFile("application/json", SETTINGS_SHARED_FILE_NAME)
                ?: throw IllegalStateException("Could not create settings-shared.json.")
          }
          resolver.openOutputStream(sharedTarget.uri)?.use { out ->
            out.write(legacyRaw.toByteArray(StandardCharsets.UTF_8))
          }
            ?: throw IllegalStateException("Could not write migrated settings-shared.json.")
          legacyRaw
        }
        else -> {
          val created =
            notebox.createFile("application/json", SETTINGS_SHARED_FILE_NAME)
              ?: throw IllegalStateException("Could not create settings-shared.json.")
          resolver.openOutputStream(created.uri)?.use { out ->
            out.write(DEFAULT_SETTINGS_JSON.toByteArray(StandardCharsets.UTF_8))
          }
            ?: throw IllegalStateException("Could not write default settings-shared.json.")
          resolver.openInputStream(created.uri)?.use { input ->
              input.bufferedReader(StandardCharsets.UTF_8).readText()
            }
            ?: throw IllegalStateException("Could not read settings-shared.json.")
        }
      }

    if (raw.isBlank()) {
      throw IllegalStateException("settings-shared.json is empty.")
    }

    var inbox = resolveOrCreateRootSubdir(root, INBOX_DIR_NAME, rootChildrenByName)
    if (!inbox.isDirectory) {
      throw IllegalStateException("Inbox exists but is not a directory.")
    }

    var general = resolveOrCreateRootSubdir(root, GENERAL_DIR_NAME, rootChildrenByName)
    if (!general.isDirectory) {
      throw IllegalStateException("General exists but is not a directory.")
    }

    val inboxRows = collectMarkdownRows(inbox)
    writeInboxMarkdownIndex(general, inboxRows.map { it.name }, resolver)

    val out = Arguments.createMap()
    out.putString("settings", raw)
    out.putArray("inboxNotes", prepareRowsToWritableArray(inboxRows, resolver))
    return out
  }

  private fun stemFromMarkdownFileName(fileName: String): String {
    return if (fileName.endsWith(MARKDOWN_SUFFIX, ignoreCase = true)) {
      fileName.substring(0, fileName.length - MARKDOWN_SUFFIX.length)
    } else {
      fileName
    }
  }

  /** Matches `buildInboxMarkdownIndexContent` in `@notebox/core` (US locale sort for stems). */
  private fun buildInboxMarkdownIndexContent(markdownFileNames: List<String>): String {
    val collator = Collator.getInstance(Locale.US)
    val stems =
      markdownFileNames
        .map { stemFromMarkdownFileName(it) }
        .sortedWith(compareBy(collator) { it })
    val lines = ArrayList<String>()
    lines.add("# Inbox")
    lines.add("")
    for (stem in stems) {
      lines.add("- [[Inbox/$stem|$stem]]")
    }
    return lines.joinToString("\n") + "\n"
  }

  /**
   * Resolve `General/Inbox.md` using the already-open [generalDir] first ([findFile]), then
   * [documentFileFromStorageUri] on the string-concat child URI, then [createFile].
   */
  private fun writeInboxMarkdownIndex(
    generalDir: DocumentFile,
    markdownFileNames: List<String>,
    resolver: ContentResolver,
  ) {
    val body = buildInboxMarkdownIndexContent(markdownFileNames).toByteArray(StandardCharsets.UTF_8)
    val byName = generalDir.findFile(INBOX_INDEX_FILE_NAME)
    val target: DocumentFile =
      if (byName != null && byName.exists() && byName.isFile) {
        byName
      } else {
        val directUri = childDocumentUri(generalDir.uri, INBOX_INDEX_FILE_NAME)
        val directDoc = documentFileFromStorageUri(directUri)
        when {
          directDoc != null && directDoc.exists() && directDoc.isFile -> directDoc
          else ->
            generalDir.createFile("text/markdown", INBOX_INDEX_FILE_NAME)
              ?: throw IllegalStateException("Could not create Inbox.md.")
        }
      }

    if (!target.isFile) {
      throw IllegalStateException("Inbox.md is not a file.")
    }

    val existing = resolver.openInputStream(target.uri)?.use { it.readBytes() }
    if (existing != null && existing.contentEquals(body)) {
      return
    }

    resolver.openOutputStream(target.uri)?.use { out -> out.write(body) }
      ?: throw IllegalStateException("Could not write Inbox.md.")
  }

  companion object {
    const val MODULE_NAME = "NoteboxVaultListing"
    private const val TAG = "NoteboxVaultListing"
    private const val E_VAULT_LISTING = "E_VAULT_LISTING"
    private const val E_VAULT_PREPARE = "E_VAULT_PREPARE"
    private const val MARKDOWN_SUFFIX = ".md"
    private const val SYNC_CONFLICT_MARKER = "sync-conflict"
    private const val NOTEBOX_DIR_NAME = ".notebox"
    private const val SETTINGS_SHARED_FILE_NAME = "settings-shared.json"
    private const val SETTINGS_LEGACY_FILE_NAME = "settings.json"
    private const val INBOX_DIR_NAME = "Inbox"
    private const val GENERAL_DIR_NAME = "General"
    private const val INBOX_INDEX_FILE_NAME = "Inbox.md"
    /** Skip prefetching body when longer than this (JS uses readFile instead). */
    private const val INBOX_NOTE_CONTENT_MAX_BYTES = 512 * 1024
    /** Matches `serializeNoteboxSettings(defaultNoteboxSettings)` in `@notebox/core` (JSON.stringify + trailing newline). */
    private const val DEFAULT_SETTINGS_JSON =
      "{\n" +
        "  \"displayName\": \"My Notebox\",\n" +
        "  \"r2\": {\n" +
        "    \"endpoint\": \"https://00000000000000000000000000000000.r2.cloudflarestorage.com\",\n" +
        "    \"bucket\": \"mock-bucket\",\n" +
        "    \"accessKeyId\": \"mock_access_key_id\",\n" +
        "    \"secretAccessKey\": \"mock_secret_access_key\"\n" +
        "  }\n" +
        "}\n"
  }
}

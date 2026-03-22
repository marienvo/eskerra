package com.notebox

import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import java.util.concurrent.Executors

/**
 * Lists .md files under a SAF directory URI on a background thread, matching JS filter/sort in
 * noteboxStorage (markdown only, exclude sync-conflict names, sort by lastModified desc).
 */
class VaultListingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun listMarkdownFiles(directoryUri: String, promise: Promise) {
    executor.execute {
      try {
        val result = buildMarkdownListing(directoryUri)
        reactContext.runOnUiQueueThread { promise.resolve(result) }
      } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
          promise.reject(E_VAULT_LISTING, e.message ?: "Vault listing failed", e)
        }
      }
    }
  }

  private fun buildMarkdownListing(directoryUri: String): WritableArray {
    val uri = Uri.parse(directoryUri)
    val dir =
      DocumentFile.fromSingleUri(reactContext, uri)
        ?: throw IllegalStateException(
          "DocumentFile.fromSingleUri returned null; use JS listing fallback.",
        )
    if (!dir.exists()) {
      throw IllegalStateException(
        "DocumentFile reports directory missing; use JS listing fallback.",
      )
    }
    if (!dir.isDirectory) {
      throw IllegalStateException(
        "URI is not a directory; use JS listing fallback.",
      )
    }

    data class Row(val uri: String, val name: String, val lastModified: Long)

    val rows = ArrayList<Row>()
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
      rows.add(Row(uri = child.uri.toString(), name = name, lastModified = lm))
    }

    rows.sortWith { a, b -> compareDescendingLastModified(a.lastModified, b.lastModified) }

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

  private fun compareDescendingLastModified(left: Long, right: Long): Int {
    val l = if (left > 0L) left else 0L
    val r = if (right > 0L) right else 0L
    return r.compareTo(l)
  }

  companion object {
    const val MODULE_NAME = "NoteboxVaultListing"
    private const val E_VAULT_LISTING = "E_VAULT_LISTING"
    private const val MARKDOWN_SUFFIX = ".md"
    private const val SYNC_CONFLICT_MARKER = "sync-conflict"
  }
}

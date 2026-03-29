package com.notebox

import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Stores podcast artwork under app-internal [filesDir] and copies legacy SAF [content://] artwork
 * into app cache on a background thread so React Native Image / Fresco avoids blocking the UI
 * thread on ContentResolver.
 */
class PodcastArtworkCacheModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun writeArtworkFile(
    baseUri: String,
    cacheKey: String,
    extension: String,
    base64Payload: String,
    promise: Promise,
  ) {
    executor.execute {
      try {
        val trimmedBase = baseUri.trim()
        val trimmedKey = cacheKey.trim()
        val trimmedExtInput = extension.trim().lowercase()
        val payload = base64Payload.trim()
        if (trimmedBase.isEmpty() || trimmedKey.isEmpty() || trimmedExtInput.isEmpty() || payload.isEmpty()) {
          reactContext.runOnUiQueueThread {
            promise.reject(E_INVALID_ARG, "baseUri, cacheKey, extension, and payload must be non-empty")
          }
          return@execute
        }

        val ext =
          when {
            trimmedExtInput.startsWith('.') -> trimmedExtInput.drop(1)
            else -> trimmedExtInput
          }
        if (ext.isEmpty() || !ext.all { it.isLetterOrDigit() }) {
          reactContext.runOnUiQueueThread { promise.reject(E_INVALID_ARG, "Invalid file extension") }
          return@execute
        }

        val safeKey = trimmedKey.replace(INVALID_FILE_SEGMENT_REGEX, "_")
        if (safeKey.isEmpty()) {
          reactContext.runOnUiQueueThread { promise.reject(E_INVALID_ARG, "Invalid cache key") }
          return@execute
        }

        val vaultFolder = sha256Hex(trimmedBase)
        val dir = File(reactContext.filesDir, "$FILES_ARTWORK_SUBDIR/$vaultFolder").apply { mkdirs() }
        val outFile = File(dir, "$safeKey.$ext")

        val bytes =
          try {
            Base64.decode(payload, Base64.DEFAULT)
          } catch (_: IllegalArgumentException) {
            reactContext.runOnUiQueueThread { promise.reject(E_INVALID_ARG, "Invalid base64 payload") }
            return@execute
          }

        if (bytes.isEmpty()) {
          reactContext.runOnUiQueueThread { promise.reject(E_INVALID_ARG, "Decoded image is empty") }
          return@execute
        }

        FileOutputStream(outFile).use { output -> output.write(bytes) }

        if (!outFile.isFile || outFile.length() == 0L) {
          outFile.delete()
          reactContext.runOnUiQueueThread { promise.reject(E_WRITE_FAILED, "Written file is missing or empty") }
          return@execute
        }

        reactContext.runOnUiQueueThread { promise.resolve(toFileUriString(outFile)) }
      } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
          promise.reject(E_WRITE_FAILED, e.message ?: "Write failed", e)
        }
      }
    }
  }

  @ReactMethod
  fun fileUriExists(fileUriStr: String, promise: Promise) {
    executor.execute {
      try {
        val uri = Uri.parse(fileUriStr.trim())
        if (uri.scheme != "file") {
          reactContext.runOnUiQueueThread { promise.resolve(false) }
          return@execute
        }

        val path = uri.path
        if (path.isNullOrEmpty()) {
          reactContext.runOnUiQueueThread { promise.resolve(false) }
          return@execute
        }

        val file = File(path)
        val canonicalFile = file.canonicalFile
        val filesRoot = reactContext.filesDir.canonicalFile
        val allowedPrefix = filesRoot.path + File.separator
        val pathOk =
          canonicalFile.path == filesRoot.path || canonicalFile.path.startsWith(allowedPrefix)
        if (!pathOk) {
          reactContext.runOnUiQueueThread { promise.resolve(false) }
          return@execute
        }

        val exists = canonicalFile.isFile && canonicalFile.length() > 0L
        reactContext.runOnUiQueueThread { promise.resolve(exists) }
      } catch (_: Exception) {
        reactContext.runOnUiQueueThread { promise.resolve(false) }
      }
    }
  }

  @ReactMethod
  fun ensureLocalArtworkFile(contentUri: String, promise: Promise) {
    executor.execute {
      try {
        val uri = Uri.parse(contentUri)
        if (uri.scheme != "content") {
          reactContext.runOnUiQueueThread {
            promise.reject(E_INVALID_URI, "Expected content:// URI")
          }
          return@execute
        }

        val cacheSubdir = File(reactContext.cacheDir, CACHE_SUBDIR).apply { mkdirs() }
        val fileName = sha256Hex(contentUri)
        val outFile = File(cacheSubdir, fileName)

        if (outFile.isFile && outFile.length() > 0L) {
          reactContext.runOnUiQueueThread { promise.resolve(toFileUriString(outFile)) }
          return@execute
        }

        if (outFile.exists() && outFile.length() == 0L) {
          outFile.delete()
        }

        val resolver = reactContext.contentResolver
        val input =
          resolver.openInputStream(uri)
            ?: run {
              reactContext.runOnUiQueueThread {
                promise.reject(E_OPEN_FAILED, "Could not open content URI")
              }
              return@execute
            }

        input.use { stream ->
          FileOutputStream(outFile).use { output -> stream.copyTo(output) }
        }

        if (!outFile.isFile || outFile.length() == 0L) {
          outFile.delete()
          reactContext.runOnUiQueueThread {
            promise.reject(E_COPY_FAILED, "Copied file is missing or empty")
          }
          return@execute
        }

        reactContext.runOnUiQueueThread { promise.resolve(toFileUriString(outFile)) }
      } catch (e: Exception) {
        reactContext.runOnUiQueueThread {
          promise.reject(E_COPY_FAILED, e.message ?: "Copy failed", e)
        }
      }
    }
  }

  private fun toFileUriString(file: File): String = "file://${file.absolutePath}"

  private fun sha256Hex(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val hash = digest.digest(input.toByteArray(Charsets.UTF_8))
    return hash.joinToString("") { b -> String.format("%02x", b.toInt() and 0xff) }
  }

  companion object {
    const val MODULE_NAME = "NoteboxPodcastArtworkCache"
    private const val CACHE_SUBDIR = "podcast-artwork"
    private const val FILES_ARTWORK_SUBDIR = "podcast-artwork-files"
    private val INVALID_FILE_SEGMENT_REGEX = Regex("[^a-zA-Z0-9._-]+")
    private const val E_INVALID_URI = "E_INVALID_URI"
    private const val E_INVALID_ARG = "E_INVALID_ARG"
    private const val E_OPEN_FAILED = "E_OPEN_FAILED"
    private const val E_COPY_FAILED = "E_COPY_FAILED"
    private const val E_WRITE_FAILED = "E_WRITE_FAILED"
  }
}

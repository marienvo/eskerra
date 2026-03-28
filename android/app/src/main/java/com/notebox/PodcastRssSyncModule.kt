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
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.notebox.podcast.rss.DefaultRssFeedFetcher
import com.notebox.podcast.rss.FrontmatterRss
import com.notebox.podcast.rss.PodcastHubLinks
import com.notebox.podcast.rss.PodcastMarkdownNaming
import com.notebox.podcast.rss.PieMarkdownParser
import com.notebox.podcast.rss.PodcastRssFileSync
import com.notebox.podcast.rss.PodcastsMdMerge
import com.notebox.podcast.rss.RssByteFetcher
import java.nio.charset.StandardCharsets
import java.time.ZoneId
import java.util.concurrent.Executors

/**
 * Batch RSS refresh for 📻 markdown under `General/`, then aggregates into `*- podcasts.md`.
 * Progress events: [EVENT_PROGRESS] with jobId, percent, phase, optional detail.
 */
class PodcastRssSyncModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor =
    Executors.newSingleThreadExecutor { r ->
      Thread(r, "NoteboxPodcastRssSync").apply { isDaemon = true }
    }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun startPodcastRssSync(generalDirectoryUri: String, jobId: String, promise: Promise) {
    val trimmedUri = generalDirectoryUri.trim()
    val trimmedJob = jobId.trim()
    if (trimmedUri.isEmpty() || trimmedJob.isEmpty()) {
      promise.reject(E_INVALID_ARG, "generalDirectoryUri and jobId must be non-empty")
      return
    }
    executor.execute {
      try {
        runSync(trimmedUri, trimmedJob)
        reactContext.runOnUiQueueThread { promise.resolve(null) }
      } catch (e: Exception) {
        Log.e(TAG, "startPodcastRssSync failed", e)
        emitProgress(trimmedJob, 0, PHASE_ERROR, e.message)
        reactContext.runOnUiQueueThread {
          promise.reject(E_SYNC_FAILED, e.message ?: "Podcast RSS sync failed", e)
        }
      }
    }
  }

  private fun runSync(generalDirectoryUri: String, jobId: String) {
    val generalDir = resolveDirectoryForListing(generalDirectoryUri)
    val resolver = reactContext.contentResolver
    val zone = ZoneId.systemDefault()
    val currentYear = java.time.LocalDate.now(zone).year
    val fetcher: RssByteFetcher = DefaultRssFeedFetcher

    val children =
      generalDir.listFiles()
        ?: throw IllegalStateException("General listFiles returned null.")

    val byName = HashMap<String, DocumentFile>()
    for (ch in children) {
      if (ch != null && ch.isFile) {
        val n = ch.name
        if (n != null) {
          byName[n] = ch
        }
      }
    }

    val podcastStubNames =
      byName.keys.filter { PodcastMarkdownNaming.isPodcastStubFile(it, currentYear) }.sorted()

    val rssSyncOrder = LinkedHashSet<String>()
    val hubTextByPodcast = HashMap<String, String>()

    for (podcastsName in podcastStubNames) {
      val hubName = PodcastMarkdownNaming.companionHubFileName(podcastsName) ?: continue
      val hubDoc = byName[hubName] ?: continue
      val hubText = readUtf8(resolver, hubDoc) ?: continue
      hubTextByPodcast[podcastsName] = hubText
      val unchecked =
        PodcastHubLinks.uncheckedLinkedMarkdownFiles(hubText) { candidate ->
          byName.containsKey(candidate) && PodcastMarkdownNaming.isRssEmojiMarkdownFile(candidate)
        }
      rssSyncOrder.addAll(unchecked)
    }

    val rssList = rssSyncOrder.toList()
    val rssDenom = rssList.size.coerceAtLeast(1)

    var doneRss = 0
    val updatedPieTexts = HashMap<String, String>()
    for (pieName in rssList) {
      val doc = byName[pieName]!!
      val full = readUtf8(resolver, doc) ?: ""
      val next = PodcastRssFileSync.syncPieMarkdownFile(full, fetcher, zone)
      if (next != full) {
        writeUtf8(resolver, doc, next)
      }
      updatedPieTexts[pieName] = next
      doneRss++
      val pct =
        if (rssList.isEmpty()) {
          0
        } else {
          (doneRss * 100 / rssDenom).coerceAtMost(99)
        }
      emitProgress(jobId, pct, PHASE_RSS_FILE, pieName)
    }

    for (podcastsName in podcastStubNames) {
      val hubText = hubTextByPodcast[podcastsName]
      val podcastsDoc = byName[podcastsName]
      if (hubText == null || podcastsDoc == null) {
        continue
      }
      val aggregateFiles =
        PodcastHubLinks.allTaskLinkedMarkdownFiles(hubText) { candidate ->
          byName.containsKey(candidate) && PodcastMarkdownNaming.isRssEmojiMarkdownFile(candidate)
        }
      val pieContents = ArrayList<Pair<String, String>>()
      for (pieName in aggregateFiles) {
        val pieDoc = byName[pieName] ?: continue
        val text = updatedPieTexts[pieName] ?: readUtf8(resolver, pieDoc) ?: ""
        val (_, body) = FrontmatterRss.splitFrontmatter(text)
        val bodyOnly = body.ifEmpty { text }
        val labelFromHub = pieName.removeSuffix(".md").removePrefix("📻 ").trim()
        val h1 = PieMarkdownParser.extractH1Title(bodyOnly)?.trim()
        val series = h1?.takeIf { it.isNotEmpty() } ?: labelFromHub
        pieContents.add(series to text)
      }
      val existing = readUtf8(resolver, podcastsDoc) ?: ""
      val merged = PodcastsMdMerge.mergePodcastsFeedFile(existing, pieContents, zone)
      if (merged != existing) {
        writeUtf8(resolver, podcastsDoc, merged)
      }
    }

    emitProgress(jobId, 100, PHASE_COMPLETE, null)
  }

  private fun emitProgress(jobId: String, percent: Int, phase: String, detail: String?) {
    val map =
      Arguments.createMap().apply {
        putString("jobId", jobId)
        putInt("percent", percent.coerceIn(0, 100))
        putString("phase", phase)
        if (detail != null) {
          putString("detail", detail)
        }
      }
    reactContext.runOnUiQueueThread {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_PROGRESS, map)
    }
  }

  private fun readUtf8(resolver: ContentResolver, doc: DocumentFile, maxBytes: Int = PODCAST_MD_MAX): String? {
    val uri = doc.uri
    val len = doc.length()
    return try {
      resolver.openInputStream(uri)?.use { input ->
        when {
          len == 0L -> ""
          len > 0L && len <= maxBytes -> {
            val bytes = ByteArray(len.toInt())
            var read = 0
            while (read < len) {
              val n = input.read(bytes, read, (len - read).toInt())
              if (n < 0) {
                break
              }
              read += n
            }
            String(bytes, 0, read, StandardCharsets.UTF_8)
          }
          else -> {
            val buffer = java.io.ByteArrayOutputStream()
            val chunk = ByteArray(8192)
            var total = 0
            while (total < maxBytes) {
              val n = input.read(chunk)
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
      Log.w(TAG, "readUtf8 failed for ${doc.uri}", e)
      null
    }
  }

  private fun writeUtf8(resolver: ContentResolver, doc: DocumentFile, content: String) {
    val body = content.trimEnd() + "\n"
    resolver.openOutputStream(doc.uri)?.use { out ->
      out.write(body.toByteArray(StandardCharsets.UTF_8))
    }
      ?: throw IllegalStateException("Could not write ${doc.uri}")
  }

  private fun documentFileFromStorageUri(uri: Uri): DocumentFile? {
    val path = uri.path
    return if (path != null && path.contains("/tree/", ignoreCase = true)) {
      DocumentFile.fromTreeUri(reactContext, uri) ?: DocumentFile.fromSingleUri(reactContext, uri)
    } else {
      DocumentFile.fromSingleUri(reactContext, uri)
    }
  }

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
    throw IllegalStateException("Could not resolve General directory for podcast RSS sync.")
  }

  companion object {
    const val MODULE_NAME = "NoteboxPodcastRssSync"
    private const val TAG = "NoteboxPodcastRssSync"
    private const val E_INVALID_ARG = "E_PODCAST_RSS_INVALID_ARG"
    private const val E_SYNC_FAILED = "E_PODCAST_RSS_SYNC_FAILED"
    const val EVENT_PROGRESS = "NoteboxPodcastRssSyncProgress"
    private const val PHASE_RSS_FILE = "rss_file"
    private const val PHASE_COMPLETE = "complete"
    private const val PHASE_ERROR = "error"
    private const val INBOX_DIR_NAME = "Inbox"
    private const val GENERAL_DIR_NAME = "General"
    private const val PODCAST_MD_MAX = 8 * 1024 * 1024
  }
}

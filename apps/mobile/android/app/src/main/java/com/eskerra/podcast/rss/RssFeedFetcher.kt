package com.eskerra.podcast.rss

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

fun interface RssByteFetcher {
  fun fetch(url: String, timeoutMs: Int): ByteArray
}

object DefaultRssFeedFetcher : RssByteFetcher {

  override fun fetch(url: String, timeoutMs: Int): ByteArray {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = timeoutMs
    conn.readTimeout = timeoutMs
    conn.instanceFollowRedirects = true
    conn.setRequestProperty(
      "User-Agent",
      "EskerraPodcastSync/1.0 (Android; RSS enclosure sync)",
    )
    conn.requestMethod = "GET"
    val code = conn.responseCode
    if (code !in 200..299) {
      conn.disconnect()
      throw IllegalStateException("RSS HTTP $code for $url")
    }
    conn.inputStream.use { input ->
      val buffer = ByteArrayOutputStream()
      val chunk = ByteArray(8192)
      while (true) {
        val n = input.read(chunk)
        if (n <= 0) {
          break
        }
        buffer.write(chunk, 0, n)
        if (buffer.size() > RSS_MAX_BYTES) {
          throw IllegalStateException("RSS payload too large for $url")
        }
      }
      return buffer.toByteArray()
    }
  }

  private const val RSS_MAX_BYTES = 12 * 1024 * 1024
}

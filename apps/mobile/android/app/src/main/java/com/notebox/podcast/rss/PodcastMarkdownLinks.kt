package com.notebox.podcast.rss

import java.util.Locale

/**
 * Shared helpers for podcast markdown lines: aggregate merge keys and safe link destinations.
 *
 * Inline link URLs in markdown should use literal `&` in query strings, not HTML `&amp;`.
 */
object PodcastMarkdownLinks {

  fun sanitizeUrl(url: String): String = url.replace("&amp;", "&", ignoreCase = false)

  /** Lowercase (US), keep only ASCII letters and digits — used for aggregate dedup keys. */
  fun normalizeTitleKey(visibleTitle: String): String {
    val lower = visibleTitle.lowercase(Locale.US)
    return buildString(lower.length) {
      for (c in lower) {
        if (c in 'a'..'z' || c in '0'..'9') {
          append(c)
        }
      }
    }
  }
}

package com.eskerra.vaultsearch

import kotlin.math.abs

private const val SNIPPET_MAX_CHARS = 160

data class SearchCandidate(
  val uri: String,
  val relPath: String,
  val title: String,
  val filename: String,
  val body: String,
  val bm25: Float,
)

data class RankedNote(
  val uri: String,
  val relPath: String,
  val title: String,
  val bestField: String,
  val matchCount: Int,
  val score: Float,
  val snippetText: String?,
  val snippetLine: Int?,
)

object SearchRanker {
  fun rank(candidate: SearchCandidate, fullQuery: String, tokens: List<String>): RankedNote {
    val qLower = fullQuery.lowercase()
    val titleL = candidate.title.lowercase()
    val fileL = candidate.filename.lowercase()
    val relL = candidate.relPath.lowercase()
    val bodyL = candidate.body.lowercase()
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
    val snippet = firstBodySnippetLine(candidate.body, qLower, tokens)
    val mc = countTokenMatches(tokens, titleL, fileL, relL, bodyL)
    return RankedNote(
      uri = candidate.uri,
      relPath = candidate.relPath,
      title = candidate.title,
      bestField = best,
      matchCount = mc,
      score = tier + candidate.bm25 * 0.02f,
      snippetText = snippet?.second,
      snippetLine = snippet?.first,
    )
  }

  private fun countTokenMatches(
    tokens: List<String>,
    titleL: String,
    fileL: String,
    relL: String,
    bodyL: String,
  ): Int {
    var n = 0
    for (t in tokens) {
      val tl = t.lowercase().trim()
      if (tl.length < 2) {
        continue
      }
      if (titleL.contains(tl) || fileL.contains(tl) || relL.contains(tl) || bodyL.contains(tl)) {
        n++
      }
    }
    return if (n > 0) n else 1
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
}

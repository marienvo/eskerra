package com.eskerra.podcast.rss

import java.time.Instant

data class ParsedPodcastFrontmatter(
  val rawBlock: String,
  val rssUrls: List<String>,
  val daysAgo: Int,
  val timeoutMs: Int,
)

object FrontmatterRss {

  private val RSS_URL_SCALAR = Regex("^\\s*rssFeedUrl\\s*:\\s*(\\S.+)\\s*\$", RegexOption.MULTILINE)
  private val DAYS_AGO = Regex("^\\s*daysAgo\\s*:\\s*(\\d+)\\s*\$", RegexOption.MULTILINE)
  private val TIMEOUT_MS = Regex("^\\s*timeoutMs\\s*:\\s*(\\d+)\\s*\$", RegexOption.MULTILINE)

  fun splitFrontmatter(fullText: String): Pair<String?, String> {
    val lines = fullText.lines()
    if (lines.isEmpty() || lines[0].trim() != "---") {
      return null to fullText
    }
    var end = -1
    for (i in 1 until lines.size) {
      if (lines[i].trim() == "---") {
        end = i
        break
      }
    }
    if (end < 0) {
      return null to fullText
    }
    val fmLines = lines.subList(0, end + 1)
    val bodyLines = if (end + 1 < lines.size) lines.subList(end + 1, lines.size) else emptyList()
    val body = bodyLines.joinToString("\n").trimEnd()
    return fmLines.joinToString("\n") to body
  }

  fun parsePodcastFrontmatter(fullText: String): ParsedPodcastFrontmatter? {
    val (fm, _) = splitFrontmatter(fullText)
    if (fm == null) {
      return null
    }
    val ls = fm.lines()
    val inner =
      if (ls.size >= 2 && ls.first().trim() == "---") {
        val endIdx = ls.indexOfLast { it.trim() == "---" }
        if (endIdx > 0) {
          ls.subList(1, endIdx).joinToString("\n")
        } else {
          ""
        }
      } else {
        ""
      }
    val urls = extractAllRssUrls(inner)
    val days = DAYS_AGO.find(inner)?.groupValues?.get(1)?.toIntOrNull() ?: 7
    val timeout = TIMEOUT_MS.find(inner)?.groupValues?.get(1)?.toIntOrNull() ?: 8000
    return ParsedPodcastFrontmatter(rawBlock = fm, rssUrls = urls, daysAgo = days, timeoutMs = timeout)
  }

  /**
   * Scalar `rssFeedUrl: https://...` plus YAML list lines under `rssFeedUrl:` (` - https://...`).
   */
  fun extractAllRssUrls(frontmatterInner: String): List<String> {
    val ordered = LinkedHashSet<String>()
    val lines = frontmatterInner.lines()
    var i = 0
    while (i < lines.size) {
      val line = lines[i]
      val scalar = RSS_URL_SCALAR.matchEntire(line.trim())
      if (scalar != null) {
        val v = trimYamlScalar(scalar.groupValues[1])
        if (v.isNotEmpty()) {
          ordered.add(v)
        }
        i++
        continue
      }
      val keyOnly = Regex("^rssFeedUrl\\s*:\$").matchEntire(line.trim())
      if (keyOnly != null) {
        i++
        while (i < lines.size) {
          val li = lines[i]
          val m = Regex("^\\s*-\\s*(.+)\$").matchEntire(li)
          if (m != null) {
            val v = trimYamlScalar(m.groupValues[1])
            if (v.isNotEmpty()) {
              ordered.add(v)
            }
            i++
            continue
          }
          if (li.isBlank()) {
            i++
            continue
          }
          break
        }
        continue
      }
      i++
    }
    return ordered.toList()
  }

  fun patchRssFetchedAt(frontmatterBlock: String, instant: Instant = Instant.now()): String {
    val iso = '"' + instant.toString() + '"'
    val lines = frontmatterBlock.lines().toMutableList()
    var replaced = false
    for (j in lines.indices) {
      val raw = lines[j]
      if (Regex("^\\s*rssFetchedAt\\s*:").containsMatchIn(raw)) {
        lines[j] = "rssFetchedAt: $iso"
        replaced = true
        break
      }
    }
    if (!replaced) {
      val insertAt = if (lines.isNotEmpty() && lines[0].trim() == "---") 1 else 0
      lines.add(insertAt, "rssFetchedAt: $iso")
    }
    return lines.joinToString("\n")
  }

  fun mergeFrontmatterAndBody(frontmatterBlock: String, body: String): String {
    val trimmedFm = frontmatterBlock.trimEnd()
    val trimmedBody = body.trim()
    return if (trimmedBody.isEmpty()) {
      "$trimmedFm\n"
    } else {
      "$trimmedFm\n\n$trimmedBody\n"
    }
  }

  private fun trimYamlScalar(raw: String): String {
    var v = raw.trim()
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.substring(1, v.length - 1).trim()
    } else if (v.startsWith('\'') && v.endsWith('\'') && v.length >= 2) {
      v = v.substring(1, v.length - 1).trim()
    }
    return v
  }
}

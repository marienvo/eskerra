package com.notebox.podcast.rss

import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

private data class EpisodeRowParts(
  val date: LocalDate,
  val played: Boolean,
  val articleUrl: String?,
  val title: String,
  /** Inline URL after fixing `&amp;` → `&` for markdown-safe destinations. */
  val mp3: String,
  val series: String,
  /** True if the raw markdown / RSS string contained a literal `&amp;` before sanitization. */
  val mp3SourceHadAmpEntity: Boolean,
)

private data class ParsedPodRow(
  val rawLine: String,
  val date: LocalDate,
  val played: Boolean,
  val mp3Lower: String,
)

private data class PieEpisodeWithSeries(
  val episode: PieEpisode,
  val seriesLabel: String,
)

object PodcastsMdMerge {

  private val EP_PREFIX = Regex("^-\\s*\\[([ xX])\\]\\s+")
  private val DATE_PREFIX = Regex("^(\\d{4}-\\d{2}-\\d{2})\\s*;\\s*(.+)$")
  private val PLAY = Regex("\\[▶️]\\(([^)]+)\\)")
  private val SERIES_TAIL = Regex("\\(([^()]+)\\)\\s*$")
  private val ARTICLE_LEAD = Regex("^\\[🌐]\\(([^)]+)\\)\\s*")

  /**
   * [pieFileContents]: pairs of (series label for `*- podcasts.md` line, full `.md` file text).
   * Series label is typically the 📻 note H1 title.
   */
  fun mergePodcastsFeedFile(
    existingContent: String,
    pieFileContents: List<Pair<String, String>>,
    zone: ZoneId,
    today: LocalDate = LocalDate.now(zone),
  ): String {
    val yesterday = today.minusDays(1)
    val weekKeepStart = today.minusDays(7)

    val pieCandidates = ArrayList<PieEpisodeWithSeries>()
    for ((seriesLabel, pieFull) in pieFileContents) {
      val (_, bodyPart) = FrontmatterRss.splitFrontmatter(pieFull)
      val body = bodyPart.ifEmpty { pieFull }
      val h1 = PieMarkdownParser.extractH1Title(body)?.trim()
      val series = h1?.takeIf { it.isNotEmpty() } ?: seriesLabel
      for (e in PieMarkdownParser.parseEpisodesFromPieBody(body)) {
        pieCandidates.add(PieEpisodeWithSeries(e, series))
      }
    }

    val lines = existingContent.split("\n")
    val prefix = ArrayList<String>()
    var hitEpisodes = false
    val existingEpisodeLines = ArrayList<String>()
    for (ln in lines) {
      val isEp = parseEpisodeParts(ln) != null
      if (isEp) {
        hitEpisodes = true
        existingEpisodeLines.add(ln)
      } else if (!hitEpisodes) {
        prefix.add(ln)
      }
    }

    val keptByMergeKey = LinkedHashMap<String, EpisodeRowParts>()
    for (raw in existingEpisodeLines) {
      val parts = parseEpisodeParts(raw) ?: continue
      when {
        parts.date.isBefore(weekKeepStart) -> { /* drop */ }
        parts.date.isBefore(yesterday) -> {
          if (!parts.played) {
            mergeRow(keptByMergeKey, parts)
          }
        }
        else -> {
          mergeRow(keptByMergeKey, parts)
        }
      }
    }

    for (cws in pieCandidates) {
      val e = cws.episode
      if (e.airDate != today && e.airDate != yesterday) {
        continue
      }
      val title = e.title.trim()
      val rawMp3 = e.mp3Url.trim()
      val mp3 = PodcastMarkdownLinks.sanitizeUrl(rawMp3)
      val article =
        e.articleUrl?.trim()?.takeIf { it.isNotEmpty() }?.let { PodcastMarkdownLinks.sanitizeUrl(it) }
      val key = mergeKeyFor(e.airDate, title)
      val candidate =
        EpisodeRowParts(
          date = e.airDate,
          played = false,
          articleUrl = article,
          title = title,
          mp3 = mp3,
          series = cws.seriesLabel.trim(),
          mp3SourceHadAmpEntity = rawMp3.contains("&amp;"),
        )
      val existing = keptByMergeKey[key]
      if (existing == null) {
        keptByMergeKey[key] = candidate
      } else {
        keptByMergeKey[key] = mergePartsPreferringBetterMp3(existing, candidate)
      }
    }

    val sortedRows =
      keptByMergeKey.values
        .map { parts ->
          val raw = formatLineFromParts(parts)
          val mp3Lower = parts.mp3.lowercase(Locale.US)
          ParsedPodRow(
            rawLine = raw,
            date = parts.date,
            played = parts.played,
            mp3Lower = mp3Lower,
          )
        }
        .sortedWith(compareByDescending<ParsedPodRow> { it.date }.thenBy { it.mp3Lower })

    val out = ArrayList<String>()
    out.addAll(prefix)
    if (out.isNotEmpty() && out.last().isNotBlank() && sortedRows.isNotEmpty()) {
      out.add("")
    }
    for (row in sortedRows) {
      out.add(row.rawLine)
    }
    val joined = out.joinToString("\n").trimEnd()
    return if (joined.endsWith("\n")) joined else "$joined\n"
  }

  private fun mergeKeyFor(date: LocalDate, visibleTitle: String): String {
    val norm = PodcastMarkdownLinks.normalizeTitleKey(visibleTitle)
    val suffix =
      if (norm.isNotEmpty()) {
        norm
      } else {
        "_empty:" + visibleTitle.hashCode()
      }
    return "${date}|$suffix"
  }

  private fun mergeRow(map: LinkedHashMap<String, EpisodeRowParts>, parts: EpisodeRowParts) {
    val key = mergeKeyFor(parts.date, parts.title)
    val existing = map[key]
    map[key] =
      if (existing == null) {
        parts
      } else {
        mergePartsPreferringBetterMp3(existing, parts)
      }
  }

  private fun mergePartsPreferringBetterMp3(
    a: EpisodeRowParts,
    b: EpisodeRowParts,
  ): EpisodeRowParts {
    val played = a.played || b.played
    val aBad = a.mp3SourceHadAmpEntity
    val bBad = b.mp3SourceHadAmpEntity
    val mp3Raw =
      when {
        aBad && !bBad -> b.mp3
        !aBad && bBad -> a.mp3
        else -> a.mp3
      }
    val mp3 = PodcastMarkdownLinks.sanitizeUrl(mp3Raw)
    val fromA = mp3Raw == a.mp3
    val article =
      if (fromA) {
        a.articleUrl ?: b.articleUrl
      } else {
        b.articleUrl ?: a.articleUrl
      }
    val title = if (fromA) a.title else b.title
    val series = if (fromA) a.series else b.series
    return EpisodeRowParts(
      date = a.date,
      played = played,
      articleUrl = article?.let { PodcastMarkdownLinks.sanitizeUrl(it) },
      title = title,
      mp3 = mp3,
      series = series,
      mp3SourceHadAmpEntity = mp3.contains("&amp;"),
    )
  }

  private fun parseEpisodeParts(line: String): EpisodeRowParts? {
    val t = line.trim()
    val pm = EP_PREFIX.find(t) ?: return null
    val played = pm.groupValues[1].lowercase(Locale.US) == "x"
    val rest = t.removePrefix(pm.value).trim()
    val dm = DATE_PREFIX.matchEntire(rest) ?: return null
    val date = LocalDate.parse(dm.groupValues[1])
    val rem = dm.groupValues[2]
    val seriesM = SERIES_TAIL.find(rem) ?: return null
    val series = seriesM.groupValues[1].trim()
    if (series.isEmpty()) {
      return null
    }
    val beforeSeries = rem.substring(0, seriesM.range.first).trim()
    val plays = PLAY.findAll(beforeSeries).toList()
    val lastPlay = plays.lastOrNull() ?: return null
    val rawMp3 = lastPlay.groupValues[1].trim()
    val mp3HadEntity = rawMp3.contains("&amp;")
    val mp3 = PodcastMarkdownLinks.sanitizeUrl(rawMp3)
    if (mp3.isEmpty()) {
      return null
    }
    val titlePart = beforeSeries.substring(0, lastPlay.range.first).trim()
    val artM = ARTICLE_LEAD.find(titlePart)
    val articleUrl: String?
    val title: String
    if (artM != null) {
      articleUrl = PodcastMarkdownLinks.sanitizeUrl(artM.groupValues[1].trim())
      title = titlePart.removePrefix(artM.value).trim()
    } else {
      articleUrl = null
      title = titlePart
    }
    if (title.isEmpty()) {
      return null
    }
    return EpisodeRowParts(
      date = date,
      played = played,
      articleUrl = articleUrl,
      title = title,
      mp3 = mp3,
      series = series,
      mp3SourceHadAmpEntity = mp3HadEntity,
    )
  }

  private fun formatLineFromParts(parts: EpisodeRowParts): String {
    val titlePart =
      buildString {
        if (!parts.articleUrl.isNullOrEmpty()) {
          append("[🌐](")
          append(parts.articleUrl)
          append(") ")
        }
        append(parts.title)
      }
    val mark = if (parts.played) "x" else " "
    return "- [$mark] ${parts.date}; $titlePart [▶️](${parts.mp3}) (${parts.series})"
  }
}

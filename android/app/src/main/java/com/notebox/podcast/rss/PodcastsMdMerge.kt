package com.notebox.podcast.rss

import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

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
      val isEp = parsePodRow(ln) != null
      if (isEp) {
        hitEpisodes = true
        existingEpisodeLines.add(ln)
      } else if (!hitEpisodes) {
        prefix.add(ln)
      }
    }

    val keptByMp3 = LinkedHashMap<String, ParsedPodRow>()
    for (raw in existingEpisodeLines) {
      val p = parsePodRow(raw) ?: continue
      when {
        p.date.isBefore(weekKeepStart) -> { /* drop */ }
        p.date.isBefore(yesterday) -> {
          if (!p.played) {
            keptByMp3[p.mp3Lower] = p
          }
        }
        else -> {
          keptByMp3[p.mp3Lower] = p
        }
      }
    }

    for (cws in pieCandidates) {
      val e = cws.episode
      if (e.airDate != today && e.airDate != yesterday) {
        continue
      }
      val key = e.mp3Url.lowercase(Locale.US)
      if (!keptByMp3.containsKey(key)) {
        val titlePart =
          buildString {
            if (!e.articleUrl.isNullOrEmpty()) {
              append("[🌐](")
              append(e.articleUrl)
              append(") ")
            }
            append(e.title)
          }
        val line =
          formatEpisodeLine(
            date = e.airDate,
            played = false,
            titlePart = titlePart,
            mp3 = e.mp3Url,
            series = cws.seriesLabel,
          )
        keptByMp3[key] =
          ParsedPodRow(
            rawLine = line,
            date = e.airDate,
            played = false,
            mp3Lower = key,
          )
      }
    }

    val sortedRows =
      keptByMp3.values.sortedWith(compareByDescending<ParsedPodRow> { it.date }.thenBy { it.mp3Lower })

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

  private fun parsePodRow(line: String): ParsedPodRow? {
    val t = line.trim()
    val pm = EP_PREFIX.find(t) ?: return null
    val played = pm.groupValues[1].lowercase(Locale.US) == "x"
    val rest = t.removePrefix(pm.value).trim()
    val dm = DATE_PREFIX.matchEntire(rest) ?: return null
    val date = LocalDate.parse(dm.groupValues[1])
    val rem = dm.groupValues[2]
    val plays = PLAY.findAll(rem).toList()
    val lastPlay = plays.lastOrNull() ?: return null
    val mp3 = lastPlay.groupValues[1].trim()
    if (mp3.isEmpty()) {
      return null
    }
    SERIES_TAIL.find(rem) ?: return null
    return ParsedPodRow(
      rawLine = line.trimEnd(),
      date = date,
      played = played,
      mp3Lower = mp3.lowercase(Locale.US),
    )
  }

  private fun formatEpisodeLine(
    date: LocalDate,
    played: Boolean,
    titlePart: String,
    mp3: String,
    series: String,
  ): String {
    val mark = if (played) "x" else " "
    return "- [$mark] ${date}; $titlePart [▶️]($mp3) ($series)"
  }
}

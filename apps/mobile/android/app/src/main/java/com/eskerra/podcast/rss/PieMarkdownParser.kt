package com.eskerra.podcast.rss

import java.time.LocalDate

object PieMarkdownParser {

  private val PLAY_LINK = Regex("\\[▶️]\\(([^)]+)\\)")
  private val ARTICLE_LEAD = Regex("^\\[🌐]\\(([^)]+)\\)\\s*")

  fun extractH1Title(body: String): String? {
    for (line in body.lineSequence()) {
      val t = line.trim()
      if (t.startsWith("# ")) {
        return t.removePrefix("# ").trim()
      }
    }
    return null
  }

  fun parseEpisodesFromPieBody(body: String): List<PieEpisode> {
    val out = ArrayList<PieEpisode>()
    var currentDay: LocalDate? = null
    for (raw in body.lines()) {
      val line = raw.trim()
      if (line.startsWith("## ")) {
        currentDay = PodcastDayHeading.parseDayHeadingLine(line)
        continue
      }
      if (!line.startsWith("- ") || currentDay == null) {
        continue
      }
      val bullet = line.removePrefix("- ").trim()
      val play = PLAY_LINK.find(bullet) ?: continue
      val mp3 = play.groupValues[1].trim()
      if (mp3.isEmpty()) {
        continue
      }
      var rest = bullet.substring(0, play.range.first).trim()
      var article: String? = null
      val artM = ARTICLE_LEAD.find(rest)
      if (artM != null) {
        article = artM.groupValues[1].trim()
        rest = rest.removePrefix(artM.value).trim()
      }
      val title = rest.trim()
      if (title.isEmpty()) {
        continue
      }
      out.add(PieEpisode(airDate = currentDay, title = title, mp3Url = mp3, articleUrl = article))
    }
    return out
  }
}

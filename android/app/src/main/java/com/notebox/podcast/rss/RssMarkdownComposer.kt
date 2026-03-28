package com.notebox.podcast.rss

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

object RssMarkdownComposer {

  fun buildPieBodyFromItems(
    h1Title: String,
    items: List<RssEpisodeItem>,
    zone: ZoneId,
    cutoffInstant: Instant,
  ): String {
    val filtered =
      items
        .filter { !it.pubInstant.isBefore(cutoffInstant) }
        .distinctBy { it.mp3Url.lowercase(Locale.US) }
        .sortedByDescending { it.pubInstant }

    val byDay = LinkedHashMap<LocalDate, MutableList<RssEpisodeItem>>()
    for (ep in filtered) {
      val day = ep.pubInstant.atZone(zone).toLocalDate()
      byDay.getOrPut(day) { ArrayList() }.add(ep)
    }
    val lines = ArrayList<String>()
    lines.add("# $h1Title")
    val daysSorted = byDay.keys.sortedDescending()
    for (day in daysSorted) {
      lines.add("")
      lines.add(PodcastDayHeading.format(day))
      lines.add("")
      val eps = byDay[day]!!.sortedByDescending { it.pubInstant }
      for (e in eps) {
        val art =
          if (e.articleUrl.isNullOrEmpty()) {
            ""
          } else {
            "[🌐](${e.articleUrl}) "
          }
        lines.add("- $art${e.title} [▶️](${e.mp3Url})")
      }
    }
    if (lines.size == 1) {
      lines.add("")
    }
    return lines.joinToString("\n").trimEnd() + "\n"
  }
}

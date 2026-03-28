package com.notebox.podcast.rss

import java.time.ZoneId
import java.util.Locale

object PodcastRssFileSync {

  /**
   * Returns updated full markdown. If every feed fetch fails or no items are parsed, returns
   * [fullText] unchanged (no [rssFetchedAt] bump).
   */
  fun syncPieMarkdownFile(
    fullText: String,
    fetcher: RssByteFetcher,
    zone: ZoneId,
  ): String {
    val (fm, body) = FrontmatterRss.splitFrontmatter(fullText)
    if (fm == null) {
      return fullText
    }
    val meta = FrontmatterRss.parsePodcastFrontmatter(fullText)
      ?: return fullText
    if (meta.rssUrls.isEmpty()) {
      return fullText
    }

    val allItems = ArrayList<RssEpisodeItem>()
    var anyFetchOk = false
    for (url in meta.rssUrls) {
      val bytes =
        try {
          fetcher.fetch(url.trim(), meta.timeoutMs).also { anyFetchOk = true }
        } catch (_: Exception) {
          continue
        }
      allItems.addAll(RssXmlParser.parseItems(bytes))
    }
    if (!anyFetchOk) {
      return fullText
    }

    val merged =
      allItems
        .groupBy { it.mp3Url.lowercase(Locale.US) }
        .values
        .map { dupes -> dupes.maxBy { it.pubInstant } }

    val cutoffDate = java.time.ZonedDateTime.now(zone).toLocalDate().minusDays(meta.daysAgo.toLong())
    val cutoffInstant = cutoffDate.atStartOfDay(zone).toInstant()

    val h1 =
      PieMarkdownParser.extractH1Title(body).takeIf { !it.isNullOrBlank() }
        ?: "Podcast"

    val newBody =
      RssMarkdownComposer.buildPieBodyFromItems(
        h1Title = h1,
        items = merged,
        zone = zone,
        cutoffInstant = cutoffInstant,
      )

    val newFm = FrontmatterRss.patchRssFetchedAt(meta.rawBlock)
    return FrontmatterRss.mergeFrontmatterAndBody(newFm, newBody.trimEnd())
  }
}

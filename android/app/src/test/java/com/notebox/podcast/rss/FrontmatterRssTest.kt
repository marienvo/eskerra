package com.notebox.podcast.rss

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FrontmatterRssTest {

  @Test
  fun extractScalarAndListUrls() {
    val yaml =
      """
      rssFeedUrl: https://one.example/feed.xml
      other: x
      """.trimIndent()
    val urls = FrontmatterRss.extractAllRssUrls(yaml)
    assertEquals(listOf("https://one.example/feed.xml"), urls)
  }

  @Test
  fun extractYamlListUrls() {
    val yaml =
      """
      rssFeedUrl:
        - https://a.example/a.xml
        - https://b.example/b.xml
      """.trimIndent()
    val urls = FrontmatterRss.extractAllRssUrls(yaml)
    assertEquals(
      listOf("https://a.example/a.xml", "https://b.example/b.xml"),
      urls,
    )
  }

  @Test
  fun patchRssFetchedAtReplacesLine() {
    val fm =
      """
      ---
      rssFetchedAt: "2020-01-01"
      rssFeedUrl: https://x
      ---
      """.trimIndent()
    val next = FrontmatterRss.patchRssFetchedAt(fm, java.time.Instant.parse("2026-03-28T12:00:00Z"))
    assertTrue(next.contains("rssFetchedAt: \"2026-03-28T12:00:00Z\""))
  }
}

package com.notebox.podcast.rss

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class PodcastsMdMergeTest {

  private val zone: ZoneId = ZoneId.of("Europe/Amsterdam")
  private val today: LocalDate = LocalDate.of(2026, 3, 28)

  @Test
  fun removesPlayedOlderThanYesterdayKeepsOpen() {
    val existing =
      """
      
      # 2026 Demo - podcasts

      - [x] 2026-03-26; Played midweek [▶️](http://played.mp3) (S)
      - [ ] 2026-03-26; Open midweek [▶️](http://open.mp3) (S)
      """.trimIndent() + "\n"

    val out = PodcastsMdMerge.mergePodcastsFeedFile(existing, emptyList(), zone, today)
    assertFalse(out.contains("played.mp3"))
    assertTrue(out.contains("open.mp3"))
  }

  @Test
  fun dropsOlderThanSevenDays() {
    val existing =
      """
      # 2026 Demo - podcasts

      - [ ] 2026-03-19; Ancient [▶️](http://old.mp3) (S)
      """.trimIndent() + "\n"

    val out = PodcastsMdMerge.mergePodcastsFeedFile(existing, emptyList(), zone, today)
    assertFalse(out.contains("old.mp3"))
  }

  @Test
  fun addsTodayEpisodeFromPie() {
    val existing =
      """
      # 2026 Demo - podcasts

      """.trimIndent() + "\n"

    val pieBody =
      """
      # Show
      
      ## Saturday, March 28th, 2026

      - Hello from pie [▶️](http://new.mp3)
      """.trimIndent()

    val pieFull =
      """
      ---
      rssFeedUrl: https://x
      ---

      $pieBody
      """.trimIndent()

    val out =
      PodcastsMdMerge.mergePodcastsFeedFile(
        existing,
        listOf("Show Z" to pieFull),
        zone,
        today,
      )
    assertTrue(out.contains("new.mp3"))
    assertTrue(out.contains("- [ ] 2026-03-28;"))
  }

  @Test
  fun dedupsSameDaySameVisibleTitleDifferentMp3PrefersAmpersandFreeUrl() {
    val existing =
      """
      # 2026 Demo - podcasts

      - [ ] 2026-03-27; My Episode Title [▶️](http://bad.mp3?a=1&amp;b=2) (S)
      - [ ] 2026-03-27; My Episode Title [▶️](http://good.mp3?a=1&b=2) (S)
      """.trimIndent() + "\n"

    val out = PodcastsMdMerge.mergePodcastsFeedFile(existing, emptyList(), zone, today)
    assertEquals(1, out.lines().count { it.contains("My Episode Title") && it.contains("▶️") })
    assertTrue(out.contains("http://good.mp3?a=1&b=2"))
    assertFalse(out.contains("&amp;"))
  }

  @Test
  fun doesNotAddPieRowWhenExistingHasSameNormalizedTitleAndDate() {
    val existing =
      """
      # 2026 Demo - podcasts

      - [ ] 2026-03-28; Pie merge test [▶️](http://existing.mp3) (S)
      """.trimIndent() + "\n"

    val pieBody =
      """
      # Show

      ## Saturday, March 28th, 2026

      - Pie merge test [▶️](http://from-pie.mp3)
      """.trimIndent()

    val pieFull =
      """
      ---
      rssFeedUrl: https://x
      ---

      $pieBody
      """.trimIndent()

    val out =
      PodcastsMdMerge.mergePodcastsFeedFile(
        existing,
        listOf("Show Z" to pieFull),
        zone,
        today,
      )
    assertEquals(1, out.lines().count { it.contains("Pie merge test") && it.contains("▶️") })
    assertTrue(out.contains("http://existing.mp3"))
    assertFalse(out.contains("from-pie.mp3"))
  }

  @Test
  fun keepsSeparateRowsForSameNormalizedTitleOnDifferentDates() {
    val existing =
      """
      # 2026 Demo - podcasts

      - [ ] 2026-03-27; SameNorm [▶️](http://a.mp3) (S)
      - [ ] 2026-03-26; SameNorm [▶️](http://b.mp3) (S)
      """.trimIndent() + "\n"

    val out = PodcastsMdMerge.mergePodcastsFeedFile(existing, emptyList(), zone, today)
    assertEquals(2, out.lines().count { it.contains("SameNorm") && it.contains("▶️") })
  }
}

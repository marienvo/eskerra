package com.notebox.podcast.rss

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
}

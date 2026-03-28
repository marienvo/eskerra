package com.notebox.podcast.rss

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PodcastHubLinksTest {

  @Test
  fun wikiFileNameAddsMd() {
    assertEquals("📻 De Dag.md", PodcastHubLinks.wikiFileName("📻 De Dag"))
    assertEquals("Foo.md", PodcastHubLinks.wikiFileName("Foo.md"))
  }

  @Test
  fun uncheckedOnlyOpenTasks() {
    val hub =
      """
      - [ ] [[📻 De Dag]]
      - [x] [[📻 Other]]
      """.trimIndent()
    val names =
      PodcastHubLinks.uncheckedLinkedMarkdownFiles(hub) {
        it == "📻 De Dag.md" || it == "📻 Other.md"
      }
    assertEquals(listOf("📻 De Dag.md"), names)
  }

  @Test
  fun allTasksIncludePlayed() {
    val hub =
      """
      - [ ] [[📻 A]]
      - [x] [[📻 B]]
      """.trimIndent()
    val names =
      PodcastHubLinks.allTaskLinkedMarkdownFiles(hub) {
        listOf("📻 A.md", "📻 B.md").contains(it)
      }
    assertEquals(2, names.size)
    assertTrue(names.contains("📻 A.md"))
    assertTrue(names.contains("📻 B.md"))
  }
}

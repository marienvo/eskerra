package com.eskerra.podcast.rss

/**
 * Parses Obsidian-style task lines with wiki links: `- [ ] [[Target]]` / `- [x] [[Target]]`.
 */
object PodcastHubLinks {

  private val HUB_LINE = Regex("^-\\s*\\[\\s*([xX ])\\s*\\]\\s*\\[\\[([^\\]]+)\\]\\]")

  fun wikiFileName(rawTarget: String): String {
    val inner = rawTarget.trim()
    val pipe = inner.indexOf('|')
    val stem = if (pipe >= 0) inner.substring(0, pipe).trim() else inner
    return if (stem.endsWith(".md", ignoreCase = true)) stem else "$stem.md"
  }

  /**
   * Unchecked tasks only (` `[ ]` ), resolved filenames that pass [predicate].
   */
  fun uncheckedLinkedMarkdownFiles(hubContent: String, predicate: (String) -> Boolean): List<String> {
    val out = LinkedHashSet<String>()
    for (line in hubContent.lineSequence()) {
      val m = HUB_LINE.matchEntire(line.trim()) ?: continue
      val mark = m.groupValues[1]
      if (mark.lowercase() == "x") {
        continue
      }
      val name = wikiFileName(m.groupValues[2])
      if (predicate(name)) {
        out.add(name)
      }
    }
    return out.toList()
  }

  /**
   * All linked .md targets from task lines (`[ ]` or `[x]`) that pass [predicate].
   */
  fun allTaskLinkedMarkdownFiles(hubContent: String, predicate: (String) -> Boolean): List<String> {
    val out = LinkedHashSet<String>()
    for (line in hubContent.lineSequence()) {
      val m = HUB_LINE.matchEntire(line.trim()) ?: continue
      val name = wikiFileName(m.groupValues[2])
      if (predicate(name)) {
        out.add(name)
      }
    }
    return out.toList()
  }
}

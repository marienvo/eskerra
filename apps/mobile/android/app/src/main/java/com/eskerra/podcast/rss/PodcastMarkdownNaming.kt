package com.eskerra.podcast.rss

import java.util.regex.Pattern

private val PODCAST_FILE_PATTERN = Pattern.compile("^(\\d{4})\\s+(.+?)\\s+-\\s+podcasts\\.md\$", Pattern.CASE_INSENSITIVE)
private val RSS_PODCAST_FILE_PATTERN = Pattern.compile("^📻\\s+.+\\.md\$")

object PodcastMarkdownNaming {

  fun isSupportedPodcastYear(year: Int, currentYear: Int): Boolean =
    year == currentYear || year == currentYear + 1

  fun parsePodcastStubFileName(fileName: String): PodStub? {
    val m = PODCAST_FILE_PATTERN.matcher(fileName.trim())
    if (!m.matches()) {
      return null
    }
    val year = m.group(1)?.toIntOrNull() ?: return null
    val section = m.group(2)?.trim() ?: return null
    if (section.isEmpty()) {
      return null
    }
    return PodStub(year, section)
  }

  fun companionHubFileName(podcastsMdName: String): String? {
    val stub = parsePodcastStubFileName(podcastsMdName) ?: return null
    return "${stub.year} ${stub.section}.md"
  }

  fun isRssEmojiMarkdownFile(fileName: String): Boolean = RSS_PODCAST_FILE_PATTERN.matcher(fileName).matches()

  fun isPodcastStubFile(fileName: String, currentYear: Int): Boolean {
    val stub = parsePodcastStubFileName(fileName) ?: return false
    return isSupportedPodcastYear(stub.year, currentYear)
  }
}

data class PodStub(val year: Int, val section: String)

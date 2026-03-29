package com.notebox.podcast.rss

import java.time.Instant

data class RssEpisodeItem(
  val title: String,
  val mp3Url: String,
  val pubInstant: Instant,
  val articleUrl: String?,
)

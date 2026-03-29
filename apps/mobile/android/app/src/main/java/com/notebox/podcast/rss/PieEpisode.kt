package com.notebox.podcast.rss

import java.time.LocalDate

data class PieEpisode(
  val airDate: LocalDate,
  val title: String,
  val mp3Url: String,
  val articleUrl: String?,
)

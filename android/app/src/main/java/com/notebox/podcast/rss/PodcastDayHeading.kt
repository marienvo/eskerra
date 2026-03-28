package com.notebox.podcast.rss

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

object PodcastDayHeading {

  private val DAY_HEADING = Regex("^##\\s+(\\w+),\\s+(\\w+)\\s+(\\d+)(?:st|nd|rd|th)?,\\s*(\\d{4})\\s*$")

  fun format(localDate: LocalDate): String {
    val dow = localDate.format(DateTimeFormatter.ofPattern("EEEE", Locale.US))
    val month = localDate.format(DateTimeFormatter.ofPattern("MMMM", Locale.US))
    val ord = ordinalDay(localDate.dayOfMonth)
    val y = localDate.year
    return "## $dow, $month $ord, $y"
  }

  fun parseDayHeadingLine(line: String): LocalDate? {
    val m = DAY_HEADING.matchEntire(line.trim()) ?: return null
    val monthStr = m.groupValues[2]
    val day = m.groupValues[3].toIntOrNull() ?: return null
    val year = m.groupValues[4].toIntOrNull() ?: return null
    return try {
      val fmt = DateTimeFormatter.ofPattern("MMMM d uuuu", Locale.US)
      LocalDate.parse("$monthStr $day $year", fmt)
    } catch (_: Exception) {
      null
    }
  }

  private fun ordinalDay(d: Int): String {
    val suf =
      when {
        d % 100 in 11..13 -> "th"
        d % 10 == 1 -> "st"
        d % 10 == 2 -> "nd"
        d % 10 == 3 -> "rd"
        else -> "th"
      }
    return "$d$suf"
  }
}

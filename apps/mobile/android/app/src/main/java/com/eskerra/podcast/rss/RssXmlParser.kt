package com.eskerra.podcast.rss

import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

object RssXmlParser {

  fun parseItems(xmlBytes: ByteArray): List<RssEpisodeItem> {
    val factory = XmlPullParserFactory.newInstance()
    factory.isNamespaceAware = false
    val parser = factory.newPullParser()
    parser.setInput(ByteArrayInputStream(xmlBytes), StandardCharsets.UTF_8.name())

    val out = ArrayList<RssEpisodeItem>()
    var inItem = false
    var title: String? = null
    var link: String? = null
    var pubDate: String? = null
    var enclosureUrl: String? = null
    var enclosureType: String? = null

    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT) {
      when (event) {
        XmlPullParser.START_TAG -> {
          when (parser.name.lowercase(Locale.US)) {
            "item" -> {
              inItem = true
              title = null
              link = null
              pubDate = null
              enclosureUrl = null
              enclosureType = null
            }
            "title" -> {
              if (inItem) {
                title = safeNextTextTrimmed(parser)
              }
            }
            "link" -> {
              if (inItem) {
                link = safeNextTextTrimmed(parser)
              }
            }
            "pubdate" -> {
              if (inItem) {
                pubDate = safeNextTextTrimmed(parser)
              }
            }
            "enclosure" -> {
              if (inItem) {
                enclosureUrl = parser.getAttributeValue(null, "url")
                enclosureType = parser.getAttributeValue(null, "type")
              }
            }
          }
        }
        XmlPullParser.END_TAG -> {
          if (parser.name.lowercase(Locale.US) == "item" && inItem) {
            val mp3 = pickMp3Url(enclosureUrl, enclosureType, link)
            val pub = parsePubDate(pubDate)
            val cleanTitle = title?.trim().orEmpty()
            if (mp3 != null && cleanTitle.isNotEmpty() && pub != null) {
              val article = link?.trim()?.takeIf { it.isNotEmpty() && !it.equals(mp3, ignoreCase = true) }
              out.add(
                RssEpisodeItem(
                  title = cleanTitle,
                  mp3Url = mp3.trim(),
                  pubInstant = pub,
                  articleUrl = article,
                ),
              )
            }
            inItem = false
          }
        }
      }
      event = parser.next()
    }
    return out
  }

  private fun pickMp3Url(enclosureUrl: String?, enclosureType: String?, link: String?): String? {
    return when {
      enclosureUrl != null &&
        (
          enclosureType?.contains("audio", ignoreCase = true) == true ||
            enclosureUrl.endsWith(".mp3", ignoreCase = true) ||
            enclosureUrl.contains(".mp3", ignoreCase = true)
        ) -> enclosureUrl
      link != null && link.endsWith(".mp3", ignoreCase = true) -> link
      else -> null
    }
  }

  private fun parsePubDate(raw: String?): Instant? {
    if (raw.isNullOrBlank()) {
      return null
    }
    val s = raw.trim()
    val formatters =
      listOf(
        DateTimeFormatter.RFC_1123_DATE_TIME,
        DateTimeFormatter.ofPattern("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US),
        DateTimeFormatter.ofPattern("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US),
      )
    for (fmt in formatters) {
      try {
        return ZonedDateTime.parse(s, fmt).toInstant()
      } catch (_: DateTimeParseException) {
        /* try next */
      }
    }
    try {
      return ZonedDateTime.parse(s).toInstant()
    } catch (_: DateTimeParseException) {
      return null
    }
  }
}

private fun safeNextTextTrimmed(parser: XmlPullParser): String =
  when (parser.next()) {
    XmlPullParser.TEXT -> parser.text?.trim() ?: ""
    else -> ""
  }

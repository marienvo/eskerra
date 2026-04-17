package com.eskerra.vaultsearch

/**
 * Builds a safe FTS5 [MATCH] expression from user tokens (quotes, colons, minus, unicode).
 * Each token is wrapped in double-quotes (phrase) and combined with implicit AND.
 */
object Fts5Query {
  private val OPERATOR_TOKENS =
    setOf("and", "or", "not", "near")

  fun buildSafeMatch(tokens: List<String>): String? {
    val parts = ArrayList<String>()
    for (raw in tokens) {
      var t = raw.lowercase().trim()
      if (t.isEmpty()) {
        continue
      }
      t = t.replace("\"", " ").replace("(", " ").replace(")", " ").replace("\\", " ")
      t = t.trimStart('-')
      if (t.isEmpty()) {
        continue
      }
      val firstWord = t.split(Regex("\\s+")).firstOrNull() ?: ""
      if (OPERATOR_TOKENS.contains(firstWord.lowercase())) {
        continue
      }
      val escaped = t.replace("\"", "\"\"")
      parts.add("\"$escaped\"")
    }
    if (parts.isEmpty()) {
      return null
    }
    return parts.joinToString(" ")
  }

  fun tokenizeQuery(queryTrimmed: String): List<String> =
    queryTrimmed.split(Regex("\\s+")).map { it.trim() }.filter { it.isNotEmpty() }
}

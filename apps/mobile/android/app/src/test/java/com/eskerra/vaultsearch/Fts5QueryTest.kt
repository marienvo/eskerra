package com.eskerra.vaultsearch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class Fts5QueryTest {
  @Test
  fun buildSafeMatchQuotesTokens() {
    val m = Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("foo bar"))!!
    assertEquals("\"foo\" \"bar\"", m)
  }

  @Test
  fun buildSafeMatchMultipleTokens() {
    val m = Fts5Query.buildSafeMatch(listOf("foo", "bar"))!!
    assertEquals("\"foo\" \"bar\"", m)
  }

  @Test
  fun buildSafeMatchColonInsideToken() {
    val m = Fts5Query.buildSafeMatch(listOf("TODO: fix"))!!
    assertEquals("\"todo: fix\"", m)
  }

  @Test
  fun buildSafeMatchLeadingMinusRemoved() {
    val m = Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("-foo"))!!
    assertEquals("\"foo\"", m)
  }

  @Test
  fun buildSafeMatchSkipsOperatorOnlyToken() {
    assertNull(Fts5Query.buildSafeMatch(listOf("AND")))
  }

  @Test
  fun tokenizeQuerySplitsWhitespace() {
    assertEquals(listOf("a", "b"), Fts5Query.tokenizeQuery("  a \t b  "))
  }
}

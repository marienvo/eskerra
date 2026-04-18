package com.eskerra.vaultsearch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class Fts5QueryBuilderTest {
  @Test
  fun stripsParensSingleGroupedToken() {
    assertEquals("\"foo\"", Fts5Query.buildSafeMatch(listOf("(foo)"))!!)
  }

  @Test
  fun unicodeAndEmojiTokenized() {
    val m = Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("café 🎉"))!!
    assertEquals("\"café\" \"🎉\"", m)
  }

  @Test
  fun operatorOnlyQueryYieldsNull() {
    assertNull(Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("OR AND")))
  }

  @Test
  fun nearOperatorSkippedMixedWithRealToken() {
    val m = Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("near hello"))!!
    assertEquals("\"hello\"", m)
  }

  @Test
  fun buildSafeMatchUsesQuotedPhraseTokens() {
    val m = Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("hello world"))!!
    assertTrue(m.matches(Regex("^\"[^\"]+\"(\\s+\"[^\"]+\")*$")))
  }

  @Test
  fun emptyYieldsNull() {
    assertNull(Fts5Query.buildSafeMatch(Fts5Query.tokenizeQuery("   ")))
  }

  @Test
  fun notNullForCjk() {
    val m = Fts5Query.buildSafeMatch(listOf("你好"))
    assertNotNull(m)
    assertEquals("\"你好\"", m)
  }
}

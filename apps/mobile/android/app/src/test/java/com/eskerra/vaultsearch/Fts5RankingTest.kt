package com.eskerra.vaultsearch

import org.junit.Assert.assertTrue
import org.junit.Test

class Fts5RankingTest {
  @Test
  fun fuzzyTitlePathBeatsBodyOnly() {
    val tokens = Fts5Query.tokenizeQuery("lisane")
    val titleHit =
      SearchRanker.rank(
        SearchCandidate(
          uri = "u1",
          relPath = "people/Lisanne.md",
          title = "Lisanne",
          filename = "Lisanne.md",
          body = "nothing",
          bm25 = -1f,
        ),
        "lisane",
        tokens,
      )
    val bodyOnly =
      SearchRanker.rank(
        SearchCandidate(
          uri = "u2",
          relPath = "x.md",
          title = "X",
          filename = "x.md",
          body = "lisane appears here in the body text",
          bm25 = -1f,
        ),
        "lisane",
        tokens,
      )
    assertTrue(titleHit.score > bodyOnly.score)
  }

  @Test
  fun prefixTierBeatsFuzzyOnly() {
    val tokens = Fts5Query.tokenizeQuery("proj")
    val prefix =
      SearchRanker.rank(
        SearchCandidate(
          uri = "u1",
          relPath = "p/projectplan.md",
          title = "Plan",
          filename = "projectplan.md",
          body = "zzz",
          bm25 = 0f,
        ),
        "proj",
        tokens,
      )
    val fuzzyOnly =
      SearchRanker.rank(
        SearchCandidate(
          uri = "u2",
          relPath = "q/x.md",
          title = "X",
          filename = "x.md",
          body = "no proj prefix but projsct typo in path segment elsewhere",
          bm25 = 0f,
        ),
        "proj",
        tokens,
      )
    assertTrue(prefix.score > fuzzyOnly.score)
  }

  @Test
  fun bm25TieBreakWhenSameTier() {
    val tokens = Fts5Query.tokenizeQuery("alpha")
    val a =
      SearchRanker.rank(
        SearchCandidate(
          uri = "1",
          relPath = "a.md",
          title = "alpha note",
          filename = "a.md",
          body = "x",
          bm25 = -10f,
        ),
        "alpha",
        tokens,
      )
    val b =
      SearchRanker.rank(
        SearchCandidate(
          uri = "2",
          relPath = "b.md",
          title = "alpha two",
          filename = "b.md",
          body = "y",
          bm25 = -5f,
        ),
        "alpha",
        tokens,
      )
    assertTrue(b.score > a.score)
  }

  @Test
  fun matchCountReflectsMultipleTokens() {
    val tokens = Fts5Query.tokenizeQuery("foo bar")
    val r =
      SearchRanker.rank(
        SearchCandidate(
          uri = "u",
          relPath = "n.md",
          title = "Foo",
          filename = "n.md",
          body = "bar here",
          bm25 = 0f,
        ),
        "foo bar",
        tokens,
      )
    assertTrue(r.matchCount >= 2)
  }
}

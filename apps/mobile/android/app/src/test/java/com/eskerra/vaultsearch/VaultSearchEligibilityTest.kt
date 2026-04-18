package com.eskerra.vaultsearch

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultSearchEligibilityTest {
  @Test
  fun ignoredDotUnderscore() {
    assertTrue(VaultSearchModule.isIgnored(".hidden"))
    assertTrue(VaultSearchModule.isIgnored("_draft"))
    assertFalse(VaultSearchModule.isIgnored("Note.md"))
  }

  @Test
  fun hardExcludedDirs() {
    assertTrue(VaultSearchModule.isHardExcluded("Assets"))
    assertTrue(VaultSearchModule.isHardExcluded("Templates"))
    assertFalse(VaultSearchModule.isHardExcluded("Inbox"))
  }

  @Test
  fun eligibleMarkdown() {
    assertTrue(VaultSearchModule.isEligibleMarkdown("ok.md"))
    assertFalse(VaultSearchModule.isEligibleMarkdown("x.txt"))
    assertFalse(VaultSearchModule.isEligibleMarkdown(".x.md"))
    assertFalse(VaultSearchModule.isEligibleMarkdown("x sync-conflict y.md"))
  }
}

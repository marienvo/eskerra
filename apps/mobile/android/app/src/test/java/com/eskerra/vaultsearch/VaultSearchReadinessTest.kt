package com.eskerra.vaultsearch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultSearchReadinessTest {
  @Test
  fun progressWhenReadDbMissing_idleWhenNoWriterAndNoActiveBase() {
    val p = VaultSearchReadiness.progressWhenReadDbMissing(hasWriteDb = false, hasActiveBaseUri = false)
    assertEquals("idle", p.indexStatus)
    assertFalse(p.indexReady)
    assertFalse(p.isBuilding)
  }

  @Test
  fun progressWhenReadDbMissing_buildingWhenWriterOpen() {
    val p = VaultSearchReadiness.progressWhenReadDbMissing(hasWriteDb = true, hasActiveBaseUri = false)
    assertEquals("building", p.indexStatus)
    assertFalse(p.indexReady)
    assertTrue(p.isBuilding)
  }

  @Test
  fun progressWhenReadDbMissing_buildingWhenActiveBaseUriOnly() {
    val p = VaultSearchReadiness.progressWhenReadDbMissing(hasWriteDb = false, hasActiveBaseUri = true)
    assertEquals("building", p.indexStatus)
    assertFalse(p.indexReady)
    assertTrue(p.isBuilding)
  }
}

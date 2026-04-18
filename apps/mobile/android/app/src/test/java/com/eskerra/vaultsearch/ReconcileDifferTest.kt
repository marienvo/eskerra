package com.eskerra.vaultsearch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconcileDifferTest {
  @Test
  fun diffDetectsAddedRemovedUpdated() {
    val inDb =
      mapOf(
        "u1" to FileSnapshot(10L, 100L),
        "u2" to FileSnapshot(20L, 200L),
        "gone" to FileSnapshot(5L, 50L),
      )
    val onDisk =
      mapOf(
        "u1" to FileSnapshot(10L, 100L),
        "u2" to FileSnapshot(99L, 200L),
        "u3" to FileSnapshot(7L, 70L),
      )
    val d = ReconcileDiffer.diff(inDb, onDisk)
    assertEquals(listOf("gone"), d.removed.sorted())
    assertEquals(listOf("u3"), d.added.sorted())
    assertEquals(listOf("u2"), d.updated.sorted())
    assertTrue(d.removed.contains("gone"))
  }
}

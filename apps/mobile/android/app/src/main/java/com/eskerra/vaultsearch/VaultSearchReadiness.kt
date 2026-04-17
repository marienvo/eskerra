package com.eskerra.vaultsearch

/**
 * Pure helper for [VaultSearchModule.startSearchSync] when the read connection is not yet open
 * (e.g. full rebuild in progress). Used by unit tests without Robolectric.
 */
object VaultSearchReadiness {
  data class ReaderMissingProgress(val indexStatus: String, val indexReady: Boolean, val isBuilding: Boolean)

  fun progressWhenReadDbMissing(hasWriteDb: Boolean, hasActiveBaseUri: Boolean): ReaderMissingProgress {
    return if (hasWriteDb || hasActiveBaseUri) {
      ReaderMissingProgress(indexStatus = "building", indexReady = false, isBuilding = true)
    } else {
      ReaderMissingProgress(indexStatus = "idle", indexReady = false, isBuilding = false)
    }
  }
}

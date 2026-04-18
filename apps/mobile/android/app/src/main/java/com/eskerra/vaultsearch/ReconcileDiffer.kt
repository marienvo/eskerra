package com.eskerra.vaultsearch

data class FileSnapshot(val size: Long, val lastModified: Long)

data class ReconcileDiffResult(
  val added: List<String>,
  val updated: List<String>,
  val removed: List<String>,
)

object ReconcileDiffer {
  fun diff(inDb: Map<String, FileSnapshot>, onDisk: Map<String, FileSnapshot>): ReconcileDiffResult {
    val removed = inDb.keys.filter { it !in onDisk }
    val added = onDisk.keys.filter { it !in inDb }
    val updated =
      onDisk.keys.filter { k ->
        val a = inDb[k] ?: return@filter false
        val b = onDisk.getValue(k)
        a.size != b.size || a.lastModified != b.lastModified
      }
    return ReconcileDiffResult(added = added, updated = updated, removed = removed)
  }
}

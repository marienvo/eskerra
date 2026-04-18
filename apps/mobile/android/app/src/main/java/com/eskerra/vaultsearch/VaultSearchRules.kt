package com.eskerra.vaultsearch

/**
 * Vault tree eligibility for search indexing (parity with
 * [packages/eskerra-core/src/vaultVisibility.ts]).
 */
object VaultSearchRules {
  private val HARD_EXCLUDED = setOf("Assets", "Excalidraw", "Scripts", "Templates")
  private const val SYNC_MARKER = "sync-conflict"

  fun isIgnored(name: String): Boolean = name.startsWith('.') || name.startsWith('_')

  fun isHardExcluded(name: String): Boolean = HARD_EXCLUDED.contains(name)

  fun isEligibleMarkdown(name: String): Boolean {
    if (!name.endsWith(".md", ignoreCase = true)) {
      return false
    }
    if (name.lowercase().contains(SYNC_MARKER)) {
      return false
    }
    if (isIgnored(name)) {
      return false
    }
    return true
  }
}

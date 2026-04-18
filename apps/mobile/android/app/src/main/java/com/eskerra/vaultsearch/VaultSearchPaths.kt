package com.eskerra.vaultsearch

import android.content.Context
import java.io.File

internal object VaultSearchPaths {
  fun indexSqliteFile(context: Context, canonicalBaseUri: String): File {
    val canonical = VaultPath.canonicalizeUri(canonicalBaseUri)
    val hash = VaultPath.baseUriHash(canonical)
    val dir = File(context.filesDir, "vault-search-index")
    if (!dir.exists()) {
      dir.mkdirs()
    }
    return File(dir, "$hash.sqlite")
  }
}

package com.eskerra.vaultsearch

import android.net.Uri
import java.security.MessageDigest

/**
 * Central path/URI helpers for vault search index (insert, delete, search results).
 * All SAF URIs and relative paths should go through here.
 */
object VaultPath {
  fun canonicalizeUri(raw: String): String {
    var s = raw.trim()
    if (s.endsWith("/") && s.length > 1) {
      val withoutTrailing = s.dropLastWhile { it == '/' }
      if (withoutTrailing.isNotEmpty() && !withoutTrailing.endsWith(":")) {
        s = withoutTrailing
      }
    }
    return s
  }

  fun baseUriHash(canonicalBaseUri: String): String {
    val digest = MessageDigest.getInstance("SHA-1")
    val bytes = digest.digest(canonicalBaseUri.toByteArray(Charsets.UTF_8))
    return bytes.joinToString("") { "%02x".format(it) }
  }

  fun relativePath(baseCanonical: String, fileUri: String): String {
    val base = canonicalizeUri(baseCanonical)
    val file = canonicalizeUri(fileUri)
    if (file.startsWith("$base/", ignoreCase = false)) {
      return file.substring(base.length + 1).replace('\\', '/')
    }
    val baseNorm = base.replace('\\', '/').trimEnd('/')
    val fileNorm = file.replace('\\', '/')
    if (fileNorm.startsWith("$baseNorm/", ignoreCase = true)) {
      return fileNorm.substring(baseNorm.length + 1)
    }
    return Uri.parse(file).lastPathSegment ?: file
  }

  fun fileNameFromUri(uriString: String): String {
    return Uri.parse(uriString).lastPathSegment ?: ""
  }

  fun titleFromFileName(fileName: String): String {
    return if (fileName.endsWith(".md", ignoreCase = true)) {
      fileName.dropLast(3)
    } else {
      fileName
    }
  }

  fun keyForIndex(uri: String): String = canonicalizeUri(uri)
}

package com.eskerra.vaultsearch

import java.io.File
import java.nio.file.Path

/**
 * Walks a local [java.io.File] tree with the same eligibility rules as SAF indexing.
 * Used for JVM unit tests; production indexing uses [VaultSearchModule.walkEligibleMarkdown].
 */
object MarkdownDirWalker {
  fun walk(root: File, visitor: (file: File, relPath: String, size: Long, lastModified: Long) -> Unit) {
    if (!root.exists()) {
      return
    }
    val rootPath = root.canonicalFile.toPath()
    walkDir(root.canonicalFile, rootPath, visitor)
  }

  private fun walkDir(dir: File, rootPath: Path, visitor: (File, String, Long, Long) -> Unit) {
    val list = dir.listFiles() ?: return
    for (child in list) {
      val name = child.name
      if (VaultSearchRules.isIgnored(name)) {
        continue
      }
      if (child.isDirectory) {
        if (VaultSearchRules.isHardExcluded(name)) {
          continue
        }
        walkDir(child, rootPath, visitor)
      } else if (child.isFile && VaultSearchRules.isEligibleMarkdown(name)) {
        val rel = rootPath.relativize(child.toPath()).toString().replace('\\', '/')
        visitor(child, rel, child.length(), child.lastModified())
      }
    }
  }
}

package com.eskerra.vaultsearch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MarkdownDirWalkerTest {
  @Test
  fun walksOnlyEligibleMarkdown() {
    val root =
      File.createTempFile("vault-walk", ".tmp").let { marker ->
        val parent = marker.parentFile ?: error("parent")
        marker.delete()
        File(parent, "vault-${System.nanoTime()}").also { it.mkdirs() }
      }
    try {
      File(root, "ok.md").writeText("# hi")
      File(root, "skip.txt").writeText("x")
      File(root, ".hidden.md").writeText("x")
      File(root, "_draft.md").writeText("x")
      val arch = File(root, "_archive")
      arch.mkdirs()
      File(arch, "in.md").writeText("x")
      val trash = File(root, ".trash")
      trash.mkdirs()
      File(trash, "t.md").writeText("x")
      val nested = File(root, "a/b")
      nested.mkdirs()
      File(nested, "c.md").writeText("y")

      val found = mutableListOf<String>()
      MarkdownDirWalker.walk(root) { _, rel, _, _ -> found.add(rel.replace('\\', '/')) }

      assertEquals(2, found.size)
      assertTrue(found.contains("ok.md"))
      assertTrue(found.contains("a/b/c.md"))
    } finally {
      root.deleteRecursively()
    }
  }
}

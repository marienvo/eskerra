package com.eskerra.vaultsearch

import org.junit.Assert.assertEquals
import org.junit.Test

class VaultPathTest {
  @Test
  fun canonicalizeUriTrimsAndTrailingSlash() {
    assertEquals("content://x", VaultPath.canonicalizeUri("  content://x/  "))
  }

  @Test
  fun baseUriHashIsStableHex() {
    val h = VaultPath.baseUriHash(VaultPath.canonicalizeUri("content://tree/v"))
    assertEquals(40, h.length)
    assertEquals(h, VaultPath.baseUriHash(VaultPath.canonicalizeUri("content://tree/v")))
  }

  @Test
  fun relativePathUnderBase() {
    val base = "content://tree/vault"
    val file = "$base/Inbox/a.md"
    assertEquals("Inbox/a.md", VaultPath.relativePath(base, file))
  }

  @Test
  fun titleFromFileNameStripsMd() {
    assertEquals("Hello", VaultPath.titleFromFileName("Hello.md"))
  }

  @Test
  fun keyForIndexCanonicalizes() {
    assertEquals("content://x", VaultPath.keyForIndex("content://x/"))
  }
}

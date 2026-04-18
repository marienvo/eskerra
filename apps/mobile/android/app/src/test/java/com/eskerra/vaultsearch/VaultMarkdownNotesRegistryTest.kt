package com.eskerra.vaultsearch

import com.eskerra.RobolectricTestApplication
import io.requery.android.database.sqlite.SQLiteDatabase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = RobolectricTestApplication::class)
class VaultMarkdownNotesRegistryTest {
  @Test
  fun migrate1ToCurrentAddsRegistryTableBackfillsFromNoteMetaWithoutWipingNoteMeta() {
    val dir = File(System.getProperty("java.io.tmpdir") ?: "/tmp", "eskerra-registry-migrate")
    dir.mkdirs()
    val f = File(dir, "m-${System.nanoTime()}.sqlite")
    f.delete()
    val db = SQLiteDatabase.openOrCreateDatabase(f, null)
    try {
      db.execSQL(
        """
        CREATE TABLE note_meta(
          uri TEXT PRIMARY KEY,
          rel_path TEXT NOT NULL,
          filename TEXT NOT NULL,
          title TEXT NOT NULL,
          size INTEGER NOT NULL,
          last_modified INTEGER NOT NULL
        );
        """.trimIndent(),
      )
      db.execSQL(
        """
        CREATE TABLE index_meta(
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        );
        """.trimIndent(),
      )
      db.execSQL(
        "INSERT INTO note_meta(uri, rel_path, filename, title, size, last_modified) VALUES(?,?,?,?,?,?)",
        arrayOf("u1", "a.md", "a.md", "a", 1L, 2L),
      )
      db.execSQL(
        "INSERT INTO index_meta(k,v) VALUES(?,?)",
        arrayOf(VaultSearchSchema.KEY_SCHEMA_VERSION, "1"),
      )

      assertTrue(VaultSearchSchema.migrate(db, 1, VaultSearchSchema.SCHEMA_VERSION))
      db.rawQuery("SELECT COUNT(*) FROM note_meta", null).use { c ->
        assertTrue(c.moveToFirst())
        assertEquals(1, c.getInt(0))
      }
      db.rawQuery(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='vault_markdown_notes'",
        null,
      ).use { c ->
        assertTrue(c.moveToFirst())
        assertEquals(1, c.getInt(0))
      }
      db.rawQuery(
        "SELECT lookup_name, display_name FROM vault_markdown_notes WHERE uri = ?",
        arrayOf("u1"),
      ).use { c ->
        assertTrue(c.moveToFirst())
        assertEquals("a", c.getString(0))
        assertEquals("a", c.getString(1))
      }
      val regAt =
        db.rawQuery("SELECT v FROM index_meta WHERE k = ?", arrayOf(VaultSearchSchema.KEY_LAST_NOTES_REGISTRY_BUILD_AT))
          .use { c ->
            assertTrue(c.moveToFirst())
            c.getString(0)?.toLongOrNull()
          }
      assertNotNull(regAt)
      assertTrue((regAt ?: 0L) > 0L)
    } finally {
      db.close()
      f.delete()
    }
  }

  @Test
  fun upsertAndDeleteRegistryRows() {
    val db = SQLiteDatabase.create(null)
    try {
      db.execSQL(
        """
        CREATE TABLE index_meta(
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        );
        """.trimIndent(),
      )
      assertTrue(VaultSearchSchema.migrate(db, 1, VaultSearchSchema.SCHEMA_VERSION))
      VaultMarkdownNotesRegistry.upsertRow(db, "content://x/Note.md", "Note.md", 99L)
      db.rawQuery(
        "SELECT lookup_name, display_name, last_modified FROM vault_markdown_notes WHERE uri = ?",
        arrayOf("content://x/Note.md"),
      ).use { c ->
        assertTrue(c.moveToFirst())
        assertEquals("note", c.getString(0))
        assertEquals("Note", c.getString(1))
        assertEquals(99L, c.getLong(2))
      }
      VaultMarkdownNotesRegistry.deleteByUriKey(db, "content://x/Note.md")
      db.rawQuery("SELECT COUNT(*) FROM vault_markdown_notes", null).use { c ->
        assertTrue(c.moveToFirst())
        assertEquals(0, c.getInt(0))
      }
    } finally {
      db.close()
    }
  }

  @Test
  fun migrate2To3BackfillsRegistryIncludingTodayFromNoteMeta() {
    val dir = File(System.getProperty("java.io.tmpdir") ?: "/tmp", "eskerra-registry-migrate-2-3")
    dir.mkdirs()
    val f = File(dir, "m-${System.nanoTime()}.sqlite")
    f.delete()
    val db = SQLiteDatabase.openOrCreateDatabase(f, null)
    try {
      db.execSQL(
        """
        CREATE TABLE note_meta(
          uri TEXT PRIMARY KEY,
          rel_path TEXT NOT NULL,
          filename TEXT NOT NULL,
          title TEXT NOT NULL,
          size INTEGER NOT NULL,
          last_modified INTEGER NOT NULL
        );
        """.trimIndent(),
      )
      db.execSQL(
        """
        CREATE TABLE index_meta(
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        );
        """.trimIndent(),
      )
      db.execSQL(
        """
        CREATE TABLE vault_markdown_notes(
          uri TEXT PRIMARY KEY,
          lookup_name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          last_modified INTEGER NOT NULL
        );
        """.trimIndent(),
      )
      db.execSQL(
        "INSERT INTO index_meta(k,v) VALUES(?,?)",
        arrayOf(VaultSearchSchema.KEY_SCHEMA_VERSION, "2"),
      )
      val todayUri = "content://tree/v/Daily/Today.md"
      db.execSQL(
        "INSERT INTO note_meta(uri, rel_path, filename, title, size, last_modified) VALUES(?,?,?,?,?,?)",
        arrayOf(todayUri, "Daily/Today.md", "Today.md", "Today", 10L, 4242L),
      )
      assertTrue(VaultSearchSchema.migrate(db, 2, VaultSearchSchema.SCHEMA_VERSION))
      db.rawQuery(
        "SELECT lookup_name, display_name, last_modified FROM vault_markdown_notes WHERE uri = ?",
        arrayOf(todayUri),
      ).use { c ->
        assertTrue(c.moveToFirst())
        assertEquals("today", c.getString(0))
        assertEquals("Today", c.getString(1))
        assertEquals(4242L, c.getLong(2))
      }
      val regAt =
        db.rawQuery("SELECT v FROM index_meta WHERE k = ?", arrayOf(VaultSearchSchema.KEY_LAST_NOTES_REGISTRY_BUILD_AT))
          .use { c ->
            assertTrue(c.moveToFirst())
            c.getString(0)?.toLongOrNull()
          }
      assertNotNull(regAt)
      assertTrue((regAt ?: 0L) > 0L)
    } finally {
      db.close()
      f.delete()
    }
  }
}

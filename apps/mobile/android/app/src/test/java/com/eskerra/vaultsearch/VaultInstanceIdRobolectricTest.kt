package com.eskerra.vaultsearch

import android.database.sqlite.SQLiteDatabase
import com.eskerra.RobolectricTestApplication
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = RobolectricTestApplication::class)
class VaultInstanceIdRobolectricTest {
  @Test
  fun vaultInstanceIdInMetaCanBeReadAndUpdated() {
    val dir = File(System.getProperty("java.io.tmpdir") ?: "/tmp", "eskerra-vid-test")
    dir.mkdirs()
    val f = File(dir, "vid-${System.nanoTime()}.sqlite")
    f.delete()
    val db = SQLiteDatabase.openOrCreateDatabase(f, null)
    db.execSQL(
      """
      CREATE TABLE index_meta(
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );
      """.trimIndent(),
    )
    db.execSQL(
      "INSERT INTO index_meta(k,v) VALUES(?,?)",
      arrayOf(VaultSearchSchema.KEY_VAULT_INSTANCE_ID, "stable-id"),
    )
    fun readId(ro: SQLiteDatabase): String {
      ro.rawQuery(
        "SELECT v FROM index_meta WHERE k = ?",
        arrayOf(VaultSearchSchema.KEY_VAULT_INSTANCE_ID),
      ).use { c ->
        assertTrue(c.moveToFirst())
        return c.getString(0)!!
      }
    }
    assertEquals("stable-id", readId(db))
    db.execSQL(
      "UPDATE index_meta SET v = ? WHERE k = ?",
      arrayOf("rotated-id", VaultSearchSchema.KEY_VAULT_INSTANCE_ID),
    )
    assertEquals("rotated-id", readId(db))
    assertNotEquals("stable-id", readId(db))
    db.close()
    f.delete()
  }
}

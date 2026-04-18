package com.eskerra.vaultsearch

import android.database.sqlite.SQLiteDatabase
import com.eskerra.RobolectricTestApplication
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = RobolectricTestApplication::class)
class SchemaMigrationRobolectricTest {
  @Test
  fun legacySchemaVersionIsNotReady() {
    val dir = File(System.getProperty("java.io.tmpdir") ?: "/tmp", "eskerra-schema-mig")
    dir.mkdirs()
    val f = File(dir, "schema-${System.nanoTime()}.sqlite")
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
      arrayOf(VaultSearchSchema.KEY_SCHEMA_VERSION, "0"),
    )
    db.execSQL(
      "INSERT INTO index_meta(k,v) VALUES(?,?)",
      arrayOf(VaultSearchSchema.KEY_LAST_FULL_BUILD_AT, "9000"),
    )
    db.execSQL(
      "INSERT INTO index_meta(k,v) VALUES(?,?)",
      arrayOf(VaultSearchSchema.KEY_VAULT_INSTANCE_ID, "vid"),
    )
    db.close()

    SQLiteDatabase.openDatabase(f.absolutePath, null, SQLiteDatabase.OPEN_READONLY, null).use { ro ->
      fun meta(k: String): String? {
        ro.rawQuery("SELECT v FROM index_meta WHERE k = ?", arrayOf(k)).use { c ->
          return if (c.moveToFirst()) c.getString(0) else null
        }
      }
      val schema = meta(VaultSearchSchema.KEY_SCHEMA_VERSION)?.toIntOrNull() ?: 0
      val lastBuild = meta(VaultSearchSchema.KEY_LAST_FULL_BUILD_AT)?.toLongOrNull() ?: 0L
      val ready = schema == VaultSearchSchema.SCHEMA_VERSION && lastBuild > 0L
      assertFalse(ready)
      assertEquals(0, schema)
    }
    f.delete()
  }
}

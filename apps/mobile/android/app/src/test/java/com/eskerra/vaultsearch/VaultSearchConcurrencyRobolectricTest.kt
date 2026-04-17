package com.eskerra.vaultsearch

import android.database.sqlite.SQLiteDatabase
import android.os.SystemClock
import com.eskerra.RobolectricTestApplication
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = RobolectricTestApplication::class)
class VaultSearchConcurrencyRobolectricTest {
  @Test
  fun readLaneReturnsWhileWriterHoldsTransaction() {
    val dir = File(System.getProperty("java.io.tmpdir") ?: "/tmp", "eskerra-wal-test")
    dir.mkdirs()
    val f = File(dir, "wal-${System.nanoTime()}.sqlite")
    f.delete()
    val w = SQLiteDatabase.openOrCreateDatabase(f, null)
    w.enableWriteAheadLogging()
    w.execSQL("CREATE TABLE t(x INTEGER NOT NULL)")
    w.execSQL("INSERT INTO t(x) VALUES(1)")
    val done = CountDownLatch(1)
    val t =
      Thread {
        w.beginTransaction()
        try {
          Thread.sleep(120)
          w.setTransactionSuccessful()
        } finally {
          w.endTransaction()
          done.countDown()
        }
      }
    t.start()

    val start = SystemClock.elapsedRealtime()
    val rdb = SQLiteDatabase.openDatabase(f.absolutePath, null, SQLiteDatabase.OPEN_READONLY, null)
    rdb.rawQuery("SELECT COUNT(*) FROM t", null).use { c ->
      assertTrue(c.moveToFirst())
    }
    rdb.close()
    val elapsed = SystemClock.elapsedRealtime() - start
    assertTrue("read took ${elapsed}ms", elapsed < 2000)
    assertTrue(done.await(5, TimeUnit.SECONDS))
    t.join(2000)
    w.close()
    f.delete()
  }
}

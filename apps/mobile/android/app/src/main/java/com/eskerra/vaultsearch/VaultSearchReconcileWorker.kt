package com.eskerra.vaultsearch

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Periodic reconcile so the on-disk FTS index stays fresh without opening the RN app.
 * Does not emit JS events; only updates SQLite [index_meta].
 */
class VaultSearchReconcileWorker(
  context: Context,
  params: WorkerParameters,
) : Worker(context, params) {
  override fun doWork(): Result {
    val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val uri = prefs.getString(KEY_ACTIVE_VAULT_URI, null)?.trim().orEmpty()
    if (uri.isEmpty()) {
      return Result.success()
    }
    return try {
      VaultSearchWorkerReconcile.reconcile(applicationContext, uri)
      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  companion object {
    const val PREFS_NAME = "eskerra_vault_search_worker"
    const val KEY_ACTIVE_VAULT_URI = "active_vault_uri"
    private const val UNIQUE_WORK_NAME = "eskerra_vault_search_reconcile"

    fun enqueuePeriodic(context: Context) {
      val constraints =
        Constraints.Builder()
          .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
          .setRequiresBatteryNotLow(true)
          .build()
      val request =
        PeriodicWorkRequestBuilder<VaultSearchReconcileWorker>(8, TimeUnit.HOURS)
          .setConstraints(constraints)
          .build()
      WorkManager.getInstance(context)
        .enqueueUniquePeriodicWork(UNIQUE_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }
  }
}

package com.eskerra

import android.app.Application
import android.os.StrictMode
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.eskerra.vaultsearch.VaultSearchReconcileWorker

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(VaultListingPackage())
        },
    )
  }

  override fun onCreate() {
    if (BuildConfig.DEBUG) {
      StrictMode.setThreadPolicy(
        StrictMode.ThreadPolicy.Builder()
          .detectDiskReads()
          .detectDiskWrites()
          .detectNetwork()
          .penaltyLog()
          .build(),
      )
      StrictMode.setVmPolicy(
        StrictMode.VmPolicy.Builder()
          .detectLeakedSqlLiteObjects()
          .detectLeakedClosableObjects()
          .penaltyLog()
          .build(),
      )
    }
    super.onCreate()
    loadReactNative(this)
    try {
      VaultSearchReconcileWorker.enqueuePeriodic(this)
    } catch (_: Exception) {
      // WorkManager may be unavailable in some test harnesses.
    }
  }
}

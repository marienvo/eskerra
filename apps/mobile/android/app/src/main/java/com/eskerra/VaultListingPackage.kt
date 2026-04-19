package com.eskerra

import com.eskerra.vaultsearch.VaultSearchModule
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class VaultListingPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    when (name) {
      VaultListingModule.MODULE_NAME -> VaultListingModule(reactContext)
      VaultSearchModule.MODULE_NAME -> VaultSearchModule(reactContext)
      PodcastArtworkCacheModule.MODULE_NAME -> PodcastArtworkCacheModule(reactContext)
      PodcastRssSyncModule.MODULE_NAME -> PodcastRssSyncModule(reactContext)
      AndroidShareIntentModule.MODULE_NAME -> AndroidShareIntentModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    fun info(name: String, cls: Class<*>) =
      ReactModuleInfo(
        name,
        cls.name,
        false,
        false,
        false,
        false,
      )
    mapOf(
      VaultListingModule.MODULE_NAME to info(VaultListingModule.MODULE_NAME, VaultListingModule::class.java),
      VaultSearchModule.MODULE_NAME to info(VaultSearchModule.MODULE_NAME, VaultSearchModule::class.java),
      PodcastArtworkCacheModule.MODULE_NAME to info(PodcastArtworkCacheModule.MODULE_NAME, PodcastArtworkCacheModule::class.java),
      PodcastRssSyncModule.MODULE_NAME to info(PodcastRssSyncModule.MODULE_NAME, PodcastRssSyncModule::class.java),
      AndroidShareIntentModule.MODULE_NAME to info(AndroidShareIntentModule.MODULE_NAME, AndroidShareIntentModule::class.java),
    )
  }
}

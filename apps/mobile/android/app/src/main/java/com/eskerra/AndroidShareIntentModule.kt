package com.eskerra

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidShareIntentModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun getPendingShare(promise: Promise) {
    try {
      val map = ShareIntentHolder.consumePending()
      if (map == null) {
        promise.resolve(null)
        return
      }
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject(E_SHARE_INTENT, e.message ?: "getPendingShare failed", e)
    }
  }

  companion object {
    const val MODULE_NAME = "AndroidShareIntent"
    private const val E_SHARE_INTENT = "E_ANDROID_SHARE_INTENT"
  }
}

package com.eskerra

import android.content.Intent
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * Holds the latest [ACTION_SEND] payload until JS consumes it (after vault + MainTabs are ready).
 * Thread-safe; stream-only shares are ignored in phase 1.
 */
object ShareIntentHolder {

  private val lock = Any()

  @Volatile private var subject: String? = null

  @Volatile private var text: String? = null

  @Volatile private var mimeType: String? = null

  fun captureFrom(intent: Intent) {
    if (intent.action != Intent.ACTION_SEND) {
      return
    }
    val stream: Uri? =
      if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      } else {
        @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }
    val extraText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    val extraSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim().orEmpty()
    val clipText =
      intent.clipData
        ?.getItemAt(0)
        ?.text
        ?.toString()
        ?.trim()
        .orEmpty()
    val resolvedText =
      when {
        extraText.isNotEmpty() -> extraText
        clipText.isNotEmpty() -> clipText
        else -> ""
      }
    if (stream != null && resolvedText.isEmpty() && extraSubject.isEmpty()) {
      return
    }
    if (resolvedText.isEmpty() && extraSubject.isEmpty()) {
      return
    }
    val type = intent.type?.trim().orEmpty().ifEmpty { "text/plain" }
    synchronized(lock) {
      subject = extraSubject.ifEmpty { null }
      text = resolvedText.ifEmpty { null }
      mimeType = type
    }
  }

  /**
   * Returns a map with keys `subject`, `text`, `mimeType` (strings; subject/text may be empty), or
   * null when nothing pending. Clears the pending payload on success.
   */
  fun consumePending(): WritableMap? {
    synchronized(lock) {
      val s = subject
      val t = text
      val m = mimeType
      if (s.isNullOrEmpty() && t.isNullOrEmpty()) {
        return null
      }
      subject = null
      text = null
      mimeType = null
      return Arguments.createMap().apply {
        putString("subject", s ?: "")
        putString("text", t ?: "")
        putString("mimeType", m ?: "text/plain")
      }
    }
  }
}

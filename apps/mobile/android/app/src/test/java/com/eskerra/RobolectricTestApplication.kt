package com.eskerra

import android.app.Application

/** Minimal app for Robolectric — avoids MainApplication / SoLoader native init. */
class RobolectricTestApplication : Application()

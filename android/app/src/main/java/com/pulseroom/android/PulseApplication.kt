package com.pulseroom.android

import android.app.Application
import com.pulseroom.android.call.CallController
import com.pulseroom.android.data.PulseApi
import com.pulseroom.android.data.SessionVault

/** The composition root owns the call independently of activity recreation. */
class PulseApplication : Application() {
    val api by lazy { PulseApi(BuildConfig.API_URL) }
    val vault by lazy { SessionVault(this) }
    val calls by lazy { CallController(this, api) }
}

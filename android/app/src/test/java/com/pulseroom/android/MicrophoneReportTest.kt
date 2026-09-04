package com.pulseroom.android

import com.pulseroom.android.call.CallState
import com.pulseroom.android.ui.microphoneReport
import org.junit.Assert.assertTrue
import org.junit.Test

class MicrophoneReportTest {
    private val connected = CallState(status = "Connected", canSpeak = true)

    @Test fun listenOnlyChannelSaysWhyTheMicrophoneIsGone() {
        val report = microphoneReport(connected.copy(canSpeak = false))
        assertTrue(report.contains("listen only"))
    }

    @Test fun mutedIsReportedAsAChoice() {
        assertTrue(microphoneReport(connected.copy(muted = true)).contains("Muted"))
    }

    @Test fun beingHeardIsConfirmed() {
        val report = microphoneReport(connected.copy(muted = false, heardSinceUnmute = true))
        assertTrue(report.contains("Working"))
    }

    @Test fun silenceFromTheSystemPointsAtThePhone() {
        val report = microphoneReport(connected.copy(muted = false, heardSinceUnmute = false))
        assertTrue(report.contains("permission"))
        assertTrue(report.contains("Xiaomi"))
    }

    @Test fun connectingDoesNotAccuseTheMicrophone() {
        val report = microphoneReport(connected.copy(status = "Connecting", muted = false))
        assertTrue(report.contains("Waiting"))
    }
}

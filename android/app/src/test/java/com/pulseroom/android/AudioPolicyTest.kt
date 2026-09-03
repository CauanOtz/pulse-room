package com.pulseroom.android

import com.pulseroom.android.call.AudioPolicy
import org.junit.Assert.assertEquals
import org.junit.Test

class AudioPolicyTest {
    @Test fun streamStartsAtUnityGain() { assertEquals(1.0, AudioPolicy.streamGain(50f), 0.0) }
    @Test fun streamCanBoostToDouble() { assertEquals(2.0, AudioPolicy.streamGain(100f), 0.0) }
    @Test fun streamZeroMutes() { assertEquals(0.0, AudioPolicy.streamGain(0f), 0.0) }
    @Test fun slidersClampOutOfRangeValues() {
        assertEquals(0.0, AudioPolicy.streamGain(-10f), 0.0)
        assertEquals(2.0, AudioPolicy.streamGain(900f), 0.0)
        assertEquals(2.0, AudioPolicy.voiceGain(900f), 0.0)
    }
    @Test fun unselectedStreamCannotBeHeard() { assertEquals(0.0, AudioPolicy.receivedGain(false, true, false, 100f), 0.0) }
    @Test fun deafenMutesBothSources() {
        assertEquals(0.0, AudioPolicy.receivedGain(true, true, true, 100f), 0.0)
        assertEquals(0.0, AudioPolicy.receivedGain(true, false, true, 100f), 0.0)
    }
    @Test fun voiceVolumeDoesNotDependOnSelectedStream() { assertEquals(1.5, AudioPolicy.receivedGain(false, false, false, 150f), 0.0) }
}

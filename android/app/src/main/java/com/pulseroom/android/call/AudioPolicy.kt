package com.pulseroom.android.call

/** 50% is unity gain for streams; the upper half is a deliberate 2x boost. */
object AudioPolicy {
    fun streamGain(percent: Float): Double = percent.coerceIn(0f, 100f).toDouble() / 50.0
    fun voiceGain(percent: Float): Double = percent.coerceIn(0f, 200f).toDouble() / 100.0
    fun receivedGain(deafened: Boolean, stream: Boolean, selected: Boolean, percent: Float): Double =
        if (deafened || (stream && !selected)) 0.0 else if (stream) streamGain(percent) else voiceGain(percent)
}

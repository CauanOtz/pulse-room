package com.pulseroom.android

import com.pulseroom.android.data.*
import org.junit.Assert.*
import org.junit.Test

class InputRulesTest {
    @Test fun registrationEnforcesBackendLengths() {
        assertTrue(InputRules.validRegistration("alex_01", "Alex", "long-password"))
        assertFalse(InputRules.validRegistration("a!", "Alex", "long-password"))
        assertFalse(InputRules.validRegistration("alex", " ", "long-password"))
        assertFalse(InputRules.validRegistration("alex", "Alex", "short"))
    }
    @Test fun membersCannotWriteReadOnlyChannels() {
        val channel = Channel("c", "s", "News", "text", readOnly = true)
        assertFalse(InputRules.canWrite(channel, Community("s", "Server", "member")))
        assertTrue(InputRules.canWrite(channel, Community("s", "Server", "admin")))
    }
    @Test fun onlyManagerCanSpeakInRestrictedChannel() {
        val channel = Channel("c", "s", "Stage", "voice", allowSpeak = false)
        assertFalse(InputRules.canSpeak(channel, Community("s", "Server", "member")))
        assertTrue(InputRules.canSpeak(channel, Community("s", "Server", "owner")))
    }
    @Test fun unknownRolesDoNotBecomeManagers() {
        assertFalse(Community("s", "Server", "super-user").canManage)
    }
}

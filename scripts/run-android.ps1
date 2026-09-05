<#
    Runs the Android application on this machine.

    The emulator is a stock Android image: it is right for the interface, the
    permission prompts and joining a room, and wrong for anything a
    manufacturer changed, which is where phone-specific faults live.
#>
param([switch]$Release, [switch]$Rebuild, [string]$Apk, [switch]$Screenshot)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$toolCache = Join-Path $env:LOCALAPPDATA 'PulseRoomBuild'
# The pinned toolchain wins over whatever this machine has set: a JAVA_HOME
# left on Java 8 by some other installer fails the build with a message about
# Gradle rather than about itself.
if (Test-Path "$toolCache\jdk") {
    $env:JAVA_HOME = (Get-ChildItem "$toolCache\jdk" -Directory | Select-Object -First 1).FullName
}
if (Test-Path "$toolCache\sdk") { $env:ANDROID_HOME = "$toolCache\sdk" }
if (-not $env:JAVA_HOME -or -not $env:ANDROID_HOME) { throw 'Install JDK 17 and the Android SDK, then set JAVA_HOME and ANDROID_HOME.' }
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"

$image = 'system-images;android-34;google_apis;x86_64'
$avd = 'pulse-room'
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

if (-not (& "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" list avd -c | Where-Object { $_ -eq $avd })) {
    Write-Output "Creating the $avd device."
    'no' | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" create avd -n $avd -k $image -d pixel_6 --force | Out-Null
}

if (-not (& $adb devices | Select-String -Pattern '^emulator-\d+\s+device$')) {
    Write-Output 'Starting the emulator.'
    # A resolver is named because the emulator inherits the host's, and a host
    # with a VPN or a corporate resolver leaves Android able to reach an address
    # and unable to look one up, which reads as the service being down.
    Start-Process -FilePath "$env:ANDROID_HOME\emulator\emulator.exe" -ArgumentList @(
        '-avd', $avd, '-gpu', 'auto', '-no-boot-anim', '-dns-server', '8.8.8.8,1.1.1.1'
    ) -WindowStyle Normal
    & $adb wait-for-device | Out-Null
    do { Start-Sleep -Seconds 2; $booted = (& $adb shell getprop sys.boot_completed 2>$null).Trim() } while ($booted -ne '1')
    Write-Output 'Android is up.'
}

if (-not $Apk) {
    if ($Rebuild -or $Release) {
        $variant = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
        # Gradle writes notes to the error stream, which PowerShell would raise
        # as a failure of a build that actually succeeded.
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & "$projectPath\android\gradlew.bat" -p "$projectPath\android" $variant
        $built = $LASTEXITCODE
        $ErrorActionPreference = $previous
        if ($built -ne 0) { throw 'The Android build failed.' }
    }
    $variantPath = if ($Release) { 'release\app-release.apk' } else { 'debug\app-debug.apk' }
    $Apk = "$projectPath\android\app\build\outputs\apk\$variantPath"
}
if (-not (Test-Path $Apk)) { throw "No application file at $Apk. Pass -Rebuild to build one." }

$package = if ($Release) { 'com.pulseroom.android' } else { 'com.pulseroom.android.debug' }
Write-Output "Installing $(Split-Path -Leaf $Apk)."
& $adb install -r $Apk
if ($LASTEXITCODE -ne 0) { throw 'Install failed. Uninstall the other build first if the signatures differ.' }
& $adb shell am start -n "$package/com.pulseroom.android.MainActivity" | Out-Null

if ($Screenshot) {
    Start-Sleep -Seconds 4
    $shot = Join-Path $projectPath 'test-results\android-emulator.png'
    New-Item -ItemType Directory -Path (Split-Path $shot) -Force | Out-Null
    # The picture is taken on the device and fetched as a file. Piping it back
    # through PowerShell would put it through a text encoder and save something
    # no viewer can open.
    & $adb shell screencap -p /sdcard/pulse-room-shot.png | Out-Null
    & $adb pull /sdcard/pulse-room-shot.png $shot | Out-Null
    & $adb shell rm /sdcard/pulse-room-shot.png | Out-Null
    Write-Output "Screenshot: $shot"
}
Write-Output "Running. Logs: adb logcat -s PulseRoom:* AndroidRuntime:E"

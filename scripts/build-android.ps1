param([switch]$Release, [switch]$InitializeSigning, [switch]$ConnectedTests)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$toolCache = Join-Path $env:LOCALAPPDATA 'PulseRoomBuild'
if (-not $env:JAVA_HOME -and (Test-Path "$toolCache\jdk")) {
    $env:JAVA_HOME = (Get-ChildItem "$toolCache\jdk" -Directory | Select-Object -First 1).FullName
}
if (-not $env:ANDROID_HOME -and (Test-Path "$toolCache\sdk")) { $env:ANDROID_HOME = "$toolCache\sdk" }
if (-not $env:JAVA_HOME -or -not $env:ANDROID_HOME) { throw 'Install JDK 17 and Android SDK 36, then set JAVA_HOME and ANDROID_HOME.' }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$signingDirectory = Join-Path $env:LOCALAPPDATA 'PulseRoomSigning'
$signingPasswordFile = Join-Path $signingDirectory 'password.xml'
$keyStore = Join-Path $signingDirectory 'pulse-room-android.jks'

if ($InitializeSigning) {
    if ((Test-Path $keyStore) -or (Test-Path $signingPasswordFile)) { throw 'Signing files already exist. Never replace a published signing identity.' }
    New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $password = [Convert]::ToBase64String($bytes)
    $credential = New-Object System.Management.Automation.PSCredential('pulse-room', (ConvertTo-SecureString $password -AsPlainText -Force))
    # Export-Clixml encrypts the password with the current Windows user's DPAPI key.
    $credential | Export-Clixml -LiteralPath $signingPasswordFile
    $env:PULSE_ANDROID_STORE_PASSWORD = $password
    $env:PULSE_ANDROID_KEY_PASSWORD = $password
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore $keyStore -storetype PKCS12 -alias pulse-room -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Pulse Room Android' -storepass:env PULSE_ANDROID_STORE_PASSWORD -keypass:env PULSE_ANDROID_KEY_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed. Preserve the signing directory for inspection.' }
}
try {
    if ($Release -and -not $env:PULSE_ANDROID_KEYSTORE) {
        if (-not (Test-Path $keyStore) -or -not (Test-Path $signingPasswordFile)) { throw 'Initialize signing once with -InitializeSigning -Release, or provide the PULSE_ANDROID_* signing variables.' }
        $credential = Import-Clixml -LiteralPath $signingPasswordFile
        $env:PULSE_ANDROID_KEYSTORE = $keyStore
        $env:PULSE_ANDROID_KEY_ALIAS = 'pulse-room'
        $env:PULSE_ANDROID_STORE_PASSWORD = $credential.GetNetworkCredential().Password
        $env:PULSE_ANDROID_KEY_PASSWORD = $env:PULSE_ANDROID_STORE_PASSWORD
    }
    $tasks = @(':app:testDebugUnitTest', ':app:lintDebug', $(if ($Release) { ':app:assembleRelease' } else { ':app:assembleDebug' }))
    if ($ConnectedTests) { $tasks += ':app:connectedDebugAndroidTest' }
    $localGradle = "$toolCache\gradle\gradle-8.13\bin\gradle.bat"
    $gradle = if (Test-Path $localGradle) { $localGradle } else { Join-Path $projectPath 'android\gradlew.bat' }
    & $gradle -p "$projectPath\android" @tasks
    if ($LASTEXITCODE -ne 0) { throw 'Android verification or build failed.' }
    $version = (Get-Content "$projectPath\package.json" | ConvertFrom-Json).version
    $variant = if ($Release) { 'release' } else { 'debug' }
    $suffix = if ($Release) { '' } else { '-debug' }
    $source = "$projectPath\android\app\build\outputs\apk\$variant\app-$variant.apk"
    $outputDirectory = Join-Path $projectPath 'release'
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $destination = Join-Path $outputDirectory "Pulse-Room-Android-$version$suffix.apk"
    Copy-Item -LiteralPath $source -Destination $destination
    Write-Output "APK: $destination"
    Get-FileHash -LiteralPath $destination -Algorithm SHA256
} finally {
    Remove-Item Env:PULSE_ANDROID_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PULSE_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
}

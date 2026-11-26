/**
 * What the Windows media controls say is playing: the same panel the volume
 * keys show. Spotify, browsers and most players publish the title, the artist
 * and the cover there. The script prints one line of JSON, or "null" when
 * nothing plays, and skips the cover when the song is the one already known.
 * The timeline gives the song's length and how far into it the player was at
 * a given moment, so the listener's side can keep counting by itself.
 *
 * Kept here rather than as a file beside the app, which the installer would
 * not carry; it runs through -EncodedCommand.
 */
// Windows PowerShell writes in the old code page of the system unless told
// otherwise, which turns "Depressão" into "Depress�o" on the way to the app.
export const utf8Output = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false';

const script = String.raw`$ErrorActionPreference = 'Stop'
${utf8Output}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
  $asTask = ($methods | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1'
    })[0]
  $asTaskWithProgress = ($methods | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperationWithProgress${'`'}2'
    })[0]
  function Await($operation, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    if (-not $task.Wait(4000)) { throw 'timed out' }
    $task.Result
  }
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.Buffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $playing = @($manager.GetSessions() | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' })
  # Spotify first when several play at once; otherwise whatever plays.
  $session = ($playing | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1)
  if (-not $session) { $session = $playing | Select-Object -First 1 }
  if (-not $session) { 'null'; exit 0 }
  $info = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $cover = $null
  if ($info.Thumbnail -and "$($info.Title)|$($info.Artist)" -ne $Known) {
    try {
      # The stream reaches PowerShell untyped, so it is read through its interfaces.
      $stream = Await ($info.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
      $size = [uint32]([Windows.Storage.Streams.IRandomAccessStream].GetProperty('Size').GetValue($stream))
      if ($size -gt 0 -and $size -lt 4MB) {
        $buffer = [Windows.Storage.Streams.Buffer]::new($size)
        $read = [Windows.Storage.Streams.IInputStream].GetMethod('ReadAsync').Invoke(
          $stream, @($buffer, $size, [Windows.Storage.Streams.InputStreamOptions]::None))
        $task = $asTaskWithProgress.MakeGenericMethod([Windows.Storage.Streams.IBuffer], [uint32]).Invoke($null, @($read))
        if ($task.Wait(4000)) {
          $bytes = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::ToArray($task.Result)
          $cover = [Convert]::ToBase64String($bytes)
        }
      }
    } catch { $cover = $null }
  }
  $length = $null
  $position = $null
  $updatedAt = $null
  try {
    $timeline = $session.GetTimelineProperties()
    $span = ($timeline.EndTime - $timeline.StartTime).TotalSeconds
    if ($span -gt 0) {
      $length = [math]::Round($span)
      $position = [math]::Round(($timeline.Position - $timeline.StartTime).TotalSeconds, 1)
      $updatedAt = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
    }
  } catch { $length = $null }
  [pscustomobject]@{
    app    = $session.SourceAppUserModelId
    length = $length
    position = $position
    updatedAt = $updatedAt
    title  = $info.Title
    artist = $info.Artist
    album  = $info.AlbumTitle
    cover  = $cover
  } | ConvertTo-Json -Compress
} catch {
  'null'
}
`;

/** The command for one reading, the song already known passed in so its cover is not read again. */
export function mediaSessionCommand(known: string): string[] {
  const source = `$Known = '${known.replace(/'/g, "''")}'
${script}`;
  return [
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(source, 'utf16le').toString('base64'),
  ];
}

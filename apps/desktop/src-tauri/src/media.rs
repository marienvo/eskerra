//! OS media integration (MPRIS on Linux via souvlaki).

use std::io;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{App, Emitter, Manager, State};

#[cfg(target_os = "linux")]
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};

#[cfg(target_os = "linux")]
fn souvlaki_io(e: souvlaki::Error) -> io::Error {
    io::Error::new(io::ErrorKind::Other, format!("{:?}", e))
}

pub struct MediaSessionState {
    #[cfg(target_os = "linux")]
    controls: Mutex<Option<MediaControls>>,
}

impl Default for MediaSessionState {
    fn default() -> Self {
        Self {
            #[cfg(target_os = "linux")]
            controls: Mutex::new(None),
        }
    }
}

pub fn init_media_session(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "linux")]
    {
        let config = PlatformConfig {
            dbus_name: "com_notebox_desktop",
            display_name: "Notebox",
            hwnd: None,
        };
        let mut controls = MediaControls::new(config).map_err(souvlaki_io)?;
        let handle = app.handle().clone();
        controls
            .attach(move |event: MediaControlEvent| {
                let action: &'static str = match event {
                    MediaControlEvent::Play => "play",
                    MediaControlEvent::Pause => "pause",
                    MediaControlEvent::Toggle => "toggle",
                    MediaControlEvent::Stop => "stop",
                    MediaControlEvent::Next => "next",
                    MediaControlEvent::Previous => "previous",
                    MediaControlEvent::Seek(_) | MediaControlEvent::SeekBy(_, _) => "seek",
                    MediaControlEvent::SetPosition(_) => "set-position",
                    MediaControlEvent::SetVolume(_) => "volume",
                    MediaControlEvent::OpenUri(_) => "open-uri",
                    MediaControlEvent::Raise => "raise",
                    MediaControlEvent::Quit => "quit",
                };
                let _ = handle.emit("media-control", action);
            })
            .map_err(souvlaki_io)?;
        let state = app.state::<MediaSessionState>();
        *state
            .controls
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "media session mutex poisoned"))? =
            Some(controls);
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
    }
    Ok(())
}

#[tauri::command]
pub fn media_set_metadata(
    state: State<'_, MediaSessionState>,
    title: String,
    artist: String,
    cover_url: Option<String>,
    duration_ms: u64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut guard = state.controls.lock().map_err(|e| e.to_string())?;
        let Some(controls) = guard.as_mut() else {
            return Ok(());
        };
        let meta = MediaMetadata {
            title: Some(title.as_str()),
            artist: Some(artist.as_str()),
            cover_url: cover_url.as_deref(),
            duration: Some(Duration::from_millis(duration_ms)),
            ..Default::default()
        };
        controls.set_metadata(meta).map_err(|e| format!("{:?}", e))?;
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (state, title, artist, cover_url, duration_ms);
    }
    Ok(())
}

#[tauri::command]
pub fn media_set_playback(
    state: State<'_, MediaSessionState>,
    playing: bool,
    position_ms: u64,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut guard = state.controls.lock().map_err(|e| e.to_string())?;
        let Some(controls) = guard.as_mut() else {
            return Ok(());
        };
        let progress = Some(MediaPosition(Duration::from_millis(position_ms)));
        let playback = if playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        };
        controls.set_playback(playback).map_err(|e| format!("{:?}", e))?;
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (state, playing, position_ms);
    }
    Ok(())
}

#[tauri::command]
pub fn media_clear_session(state: State<'_, MediaSessionState>) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut guard = state.controls.lock().map_err(|e| e.to_string())?;
        let Some(controls) = guard.as_mut() else {
            return Ok(());
        };
        controls
            .set_playback(MediaPlayback::Stopped)
            .map_err(|e| format!("{:?}", e))?;
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = state;
    }
    Ok(())
}

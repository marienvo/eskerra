//! OS media integration (MPRIS on Linux via souvlaki).

use std::io;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use sha2::{Digest, Sha256};
use tauri::{App, AppHandle, Emitter, Manager, State};

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
        // MPRIS well-known names must be unique per session. A fixed `dbus_name` clashes when
        // another Eskerra (or crashed) process still owns `org.mpris.MediaPlayer2.<name>`;
        // souvlaki's background thread unwraps registration errors and would abort the app.
        //
        // Use `<app>.instance<pid>` so GNOME Shell strips the suffix and resolves `eskerra.desktop`
        // for the media widget app icon (see MPRIS instance naming).
        let dbus_name = format!("eskerra.instance{}", std::process::id());
        let dbus_name: &'static str = Box::leak(dbus_name.into_boxed_str());
        let config = PlatformConfig {
            dbus_name,
            display_name: "Eskerra",
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

/// Max artwork download size (bytes).
const ARTWORK_MAX_BYTES: u64 = 4 * 1024 * 1024;
const ARTWORK_FETCH_TIMEOUT_SECS: u64 = 5;

fn artwork_cache_digest(url: &str) -> String {
    let d = Sha256::digest(url.as_bytes());
    d.iter()
        .take(8)
        .fold(String::with_capacity(16), |mut acc, b| {
            use std::fmt::Write;
            let _ = write!(acc, "{:02x}", b);
            acc
        })
}

fn extension_from_content_type(ct: &str) -> &'static str {
    let c = ct
        .split(';')
        .next()
        .unwrap_or(ct)
        .trim()
        .to_ascii_lowercase();
    if c.contains("jpeg") || c.contains("/jpg") {
        ".jpg"
    } else if c.contains("png") {
        ".png"
    } else if c.contains("webp") {
        ".webp"
    } else if c.contains("gif") {
        ".gif"
    } else if c.contains("svg") {
        ".svg"
    } else {
        ".img"
    }
}

fn file_uri_for_path(path: &Path) -> Result<String, String> {
    let abs = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    let s = abs.to_str().ok_or_else(|| "non-UTF8 path".to_string())?;
    Ok(format!("file://{}", s))
}

/// Download remote artwork to the app cache and return a `file://` URI for MPRIS `mpris:artUrl`.
#[tauri::command]
pub async fn media_cache_artwork(app: AppHandle, url: String) -> Result<String, String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("only http(s) artwork URLs are supported".to_string());
    }

    let digest = artwork_cache_digest(trimmed);
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("mpris-artwork");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(ARTWORK_FETCH_TIMEOUT_SECS))
        .use_rustls_tls()
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(trimmed)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("artwork GET failed: {}", res.status()));
    }
    if let Some(len) = res.content_length() {
        if len > ARTWORK_MAX_BYTES {
            return Err("artwork too large".to_string());
        }
    }

    let ct = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let ext = extension_from_content_type(ct);
    let dest = cache_dir.join(format!("{}{}", digest, ext));

    if dest.exists() {
        return file_uri_for_path(&dest);
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() as u64 > ARTWORK_MAX_BYTES {
        return Err("artwork too large".to_string());
    }

    let tmp = cache_dir.join(format!(".{}.{}.part", digest, std::process::id()));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    match std::fs::rename(&tmp, &dest) {
        Ok(()) => file_uri_for_path(&dest),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            if dest.exists() {
                file_uri_for_path(&dest)
            } else {
                Err(format!("failed to persist artwork: {e}"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{artwork_cache_digest, extension_from_content_type};

    #[test]
    fn digest_is_sixteen_hex_chars() {
        let d = artwork_cache_digest("https://example.com/cover.png");
        assert_eq!(d.len(), 16);
        assert!(d.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn extension_from_mime() {
        assert_eq!(extension_from_content_type("image/jpeg"), ".jpg");
        assert_eq!(extension_from_content_type("image/png; charset=utf-8"), ".png");
        assert_eq!(extension_from_content_type("application/octet-stream"), ".img");
    }
}

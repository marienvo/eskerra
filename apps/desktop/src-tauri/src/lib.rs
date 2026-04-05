mod media;
mod r2_http;
mod tiling;
mod tiling_score;
#[cfg(target_os = "linux")]
mod tiling_gdk;
mod vault;
mod vault_watch;
mod window_state_disk;

use vault::VaultRootState;

#[cfg(all(not(mobile), debug_assertions))]
fn prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_prevent_default::Flags;

    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::all().difference(Flags::DEV_TOOLS | Flags::RELOAD))
        .build()
}

/// Release builds only block the context menu here. Editor shortcuts (e.g. Cmd+W smart shrink/expand
/// in the vault CodeMirror surface) rely on JS `preventDefault` instead—**macOS:** manually verify
/// Cmd+W does not close the window while the note editor is focused.
#[cfg(all(not(mobile), not(debug_assertions)))]
fn prevent_default_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_prevent_default::Flags;

    tauri_plugin_prevent_default::Builder::new()
        .with_flags(Flags::CONTEXT_MENU)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(VaultRootState::default())
        .manage(media::MediaSessionState::default());

    #[cfg(not(mobile))]
    {
        builder = builder.plugin(prevent_default_plugin());
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_store::Builder::default()
                .build(),
        )
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .skip_initial_state("main")
                .build(),
        )
        .setup(|app| {
            media::init_media_session(app)?;
            vault_watch::setup_vault_watch(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tiling::get_window_tiling_detection,
            r2_http::r2_signed_fetch,
            vault::vault_set_session,
            vault::vault_get_session,
            vault::vault_exists,
            vault::vault_mkdir,
            vault::vault_read_file,
            vault::vault_write_file,
            vault::vault_write_file_bytes,
            vault::vault_import_files_into_attachments,
            vault::vault_remove_file,
            vault::vault_remove_tree,
            vault::vault_rename_file,
            vault::vault_list_dir,
            vault_watch::vault_start_watch,
            window_state_disk::eskerra_peek_window_state_file,
            media::media_set_metadata,
            media::media_set_playback,
            media::media_clear_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

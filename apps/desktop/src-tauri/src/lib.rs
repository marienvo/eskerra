mod media;
mod vault;

use vault::VaultRootState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultRootState::default())
        .manage(media::MediaSessionState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_store::Builder::default()
                .build(),
        )
        .setup(|app| {
            media::init_media_session(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_set_session,
            vault::vault_get_session,
            vault::vault_exists,
            vault::vault_mkdir,
            vault::vault_read_file,
            vault::vault_write_file,
            vault::vault_remove_file,
            vault::vault_list_dir,
            media::media_set_metadata,
            media::media_set_playback,
            media::media_clear_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use crate::connect::ConnectView;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use windows::{
    Foundation::TypedEventHandler,
    Media::{
        MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls as Controls,
        SystemMediaTransportControlsButton as Button,
        SystemMediaTransportControlsButtonPressedEventArgs as Args,
    },
    Win32::{Foundation::HWND, System::WinRT::ISystemMediaTransportControlsInterop},
    core::{HSTRING, Result, factory},
};

pub struct WindowsMedia {
    controls: Controls,
    token: i64,
    last: Mutex<Option<(String, String, String, bool)>>,
}

impl WindowsMedia {
    pub fn new(hwnd: HWND, app: AppHandle) -> Result<Self> {
        let interop = factory::<Controls, ISystemMediaTransportControlsInterop>()?;
        // Tauri owns this live top-level window for the lifetime of the app.
        let controls: Controls = unsafe { interop.GetForWindow(hwnd)? };
        let handler = TypedEventHandler::<Controls, Args>::new(move |_, args| {
            if let Some(args) = args.as_ref() {
                let action = match args.Button()? {
                    Button::Play => "play",
                    Button::Pause => "pause",
                    Button::Next => "next",
                    Button::Previous => "previous",
                    _ => return Ok(()),
                };
                let _ = app.emit("windows-media-button", action);
            }
            Ok(())
        });
        let token = controls.ButtonPressed(&handler)?;
        controls.SetIsEnabled(false)?;
        Ok(Self {
            controls,
            token,
            last: Mutex::new(None),
        })
    }

    pub fn clear(&self) {
        if let Ok(mut last) = self.last.lock() {
            *last = None;
        }
        let _ = self.controls.SetIsEnabled(false);
    }

    pub fn update(&self, view: &ConnectView) -> Result<()> {
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        let Some(track) = view
            .track
            .as_ref()
            .filter(|_| view.ready && view.active_device_id == view.local_device_id)
        else {
            if last.take().is_some() {
                self.controls.SetIsEnabled(false)?;
            }
            return Ok(());
        };
        let key = (
            track.name.clone(),
            track.artist.clone(),
            track.album.clone(),
            view.playing,
        );
        if last.as_ref() == Some(&key) {
            return Ok(());
        }
        let controls = &self.controls;
        controls.SetIsPlayEnabled(true)?;
        controls.SetIsPauseEnabled(true)?;
        controls.SetIsNextEnabled(true)?;
        controls.SetIsPreviousEnabled(true)?;
        let updater = controls.DisplayUpdater()?;
        updater.SetType(MediaPlaybackType::Music)?;
        let music = updater.MusicProperties()?;
        music.SetTitle(&HSTRING::from(track.name.as_str()))?;
        music.SetArtist(&HSTRING::from(track.artist.as_str()))?;
        music.SetAlbumTitle(&HSTRING::from(track.album.as_str()))?;
        updater.Update()?;
        controls.SetPlaybackStatus(if view.playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        })?;
        controls.SetIsEnabled(true)?;
        *last = Some(key);
        Ok(())
    }
}

impl Drop for WindowsMedia {
    fn drop(&mut self) {
        let _ = self.controls.RemoveButtonPressed(self.token);
        self.clear();
    }
}

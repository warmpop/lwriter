//! Optional Discord Rich Presence. Off by default (opt-in in settings) —
//! this is the one feature that talks to a third party, so it doesn't get
//! to be silent-by-default like everything else in the app.
//!
//! Shows: a rotating "cute" flavor line, an elapsed-time clock (Discord's
//! own `timestamps.start` rendering — we never format a timer ourselves),
//! and the lwriter mark, which is itself the clickable link to
//! lwriter.lyn.quest (via `large_url`). It never receives or transmits a
//! document's name or contents — only "a document became active just now",
//! fired from `loadDocument()` in app.js.
//!
//! Runs entirely on a background thread; the Discord desktop client may
//! not be running, may close mid-session, or may never appear at all —
//! all of that is expected and handled by quietly retrying, the same way
//! any other app's Rich Presence integration (Spotify, VS Code, games) does.
//! A `discord-status` event is emitted on connect/disconnect so the UI can
//! give the user a one-line confirmation when they flip the toggle.

use discord_rich_presence::activity::{Activity, Assets, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

/// lwriter's Discord Application ID for Rich Presence.
///
/// This is NOT a secret — every Rich Presence integration (games, Spotify,
/// VS Code's Discord extension) embeds its application ID directly in the
/// binary; only the IPC connection to a locally-running Discord client
/// uses it, there's no server-side auth attached.
const CLIENT_ID: &str = "1243651433606287380";

/// Art-asset key uploaded under the Discord app's Rich Presence → Art
/// Assets (must match exactly). If the image doesn't appear, it's almost
/// always this key not matching, or Discord still propagating a fresh
/// upload (can take a few minutes).
const ASSET_KEY: &str = "logo";
const LARGE_TEXT: &str = "lwriter — a calm writing app";
/// Clicking the large image opens this (Discord's `large_url`), which is
/// the subtle "download" affordance instead of a full button.
const DOWNLOAD_URL: &str = "https://lwriter.lyn.quest";

const FLAVORS: &[&str] = &[
    "putting words in a row",
    "in the writing cave",
    "chasing a good sentence",
    "letting the cursor blink",
    "somewhere mid-thought",
    "making quiet progress",
    "wrangling a paragraph",
    "on a roll, probably",
    "typing calmly",
    "in the flow",
    "collecting stray thoughts",
    "one sentence at a time",
];

enum Msg {
    SetEnabled(bool),
    SessionStart,
}

static TX: OnceLock<Mutex<Sender<Msg>>> = OnceLock::new();
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

fn send(msg: Msg) {
    if let Some(tx) = TX.get() {
        let _ = tx.lock().unwrap().send(msg);
    }
}

/// Tell the frontend what the Discord connection is doing, so a toast can
/// confirm the toggle actually did something (connected / waiting / off).
fn emit_status(status: &str) {
    if let Some(app) = APP.get() {
        let _ = app.emit("discord-status", status);
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// No `rand` dependency needed for a cosmetic flavor line — the low bits
/// of the clock are plenty random for "which cute phrase shows up".
fn random_flavor() -> &'static str {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    FLAVORS[(n as usize) % FLAVORS.len()]
}

fn build_activity(flavor: &'static str, start_ms: i64) -> Activity<'static> {
    Activity::new()
        .details("writing")
        .state(flavor)
        .timestamps(Timestamps::new().start(start_ms))
        .assets(
            Assets::new()
                .large_image(ASSET_KEY)
                .large_text(LARGE_TEXT)
                .large_url(DOWNLOAD_URL),
        )
}

/// Spawn the background thread that owns the Discord IPC connection.
/// Call once, at app startup.
pub fn init(app: tauri::AppHandle) {
    let (tx, rx) = mpsc::channel();
    TX.set(Mutex::new(tx)).ok();
    APP.set(app).ok();

    std::thread::spawn(move || {
        let mut client: Option<DiscordIpcClient> = None;
        let mut enabled = false;
        let mut session: Option<(i64, &'static str)> = None;
        // Only push a fresh update when something actually changed —
        // avoids hammering the IPC pipe every tick for no reason.
        let mut dirty = false;
        // Status reporting: announce the first connect outcome after the
        // user enables, and re-announce if the connection later drops.
        let mut connected_announced = false;
        let mut waiting_announced = false;

        loop {
            match rx.recv_timeout(Duration::from_secs(3)) {
                Ok(Msg::SetEnabled(on)) => {
                    if on != enabled {
                        enabled = on;
                        if !enabled {
                            if let Some(c) = client.as_mut() {
                                let _ = c.close();
                            }
                            client = None;
                            session = None;
                            connected_announced = false;
                            waiting_announced = false;
                            emit_status("off");
                        } else {
                            dirty = true;
                        }
                    }
                }
                Ok(Msg::SessionStart) => {
                    session = Some((now_millis(), random_flavor()));
                    dirty = true;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if !enabled {
                continue;
            }

            // (Re)connect lazily — Discord may not be open yet, or may
            // have been closed and reopened since the last attempt.
            if client.is_none() {
                let mut c = DiscordIpcClient::new(CLIENT_ID);
                if c.connect().is_ok() {
                    client = Some(c);
                    dirty = true;
                    if !connected_announced {
                        emit_status("connected");
                        connected_announced = true;
                        waiting_announced = false;
                    }
                } else {
                    if !waiting_announced {
                        emit_status("waiting");
                        waiting_announced = true;
                    }
                    continue;
                }
            }

            if !dirty {
                continue;
            }
            let Some((start_ms, flavor)) = session else {
                continue;
            };
            let Some(c) = client.as_mut() else { continue };

            if c.set_activity(build_activity(flavor, start_ms)).is_err() {
                // Discord likely closed — drop the client, reconnect on
                // the next loop iteration, and allow a fresh announcement.
                client = None;
                connected_announced = false;
            } else {
                dirty = false;
            }
        }
    });
}

/// Turn Discord Rich Presence on or off. Driven by the settings toggle;
/// state itself (on/off) is persisted on the frontend, same as every
/// other setting.
#[tauri::command]
pub fn discord_set_enabled(enabled: bool) {
    send(Msg::SetEnabled(enabled));
}

/// Reset the elapsed-time clock and roll a new flavor line. Called
/// whenever a different document becomes the active one — never receives
/// or forwards the document's name, path, or contents.
#[tauri::command]
pub fn discord_session_start() {
    send(Msg::SessionStart);
}

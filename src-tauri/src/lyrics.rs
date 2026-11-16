use librespot_core::{SpotifyUri, error::ErrorKind, session::Session};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug)]
pub enum LyricsError {
    InvalidTrack,
    Unavailable,
    Network,
    Response,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub lines: Vec<Line>,
    pub synchronized: bool,
    pub provider: String,
    pub background: Option<u32>,
    pub right_to_left: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    text: String,
    start_ms: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    lyrics: Option<RawLyrics>,
    #[serde(default)]
    colors: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLyrics {
    sync_type: String,
    lines: Vec<RawLine>,
    #[serde(default)]
    provider_display_name: String,
    #[serde(default)]
    is_rtl_language: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLine {
    words: String,
    #[serde(default)]
    start_time_ms: Value,
}

fn timestamp(value: &Value) -> Option<u32> {
    match value {
        Value::Number(n) => u32::try_from(n.as_u64()?).ok(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn parse(body: &[u8]) -> Result<Option<Lyrics>, LyricsError> {
    if body.is_empty() {
        return Ok(None);
    }
    if body.len() > 512 * 1024 {
        return Err(LyricsError::Response);
    }
    let payload: Payload = serde_json::from_slice(body).map_err(|_| LyricsError::Response)?;
    let Some(lyrics) = payload.lyrics else { return Ok(None); };
    if lyrics.lines.len() > 1000
        || lyrics
            .lines
            .iter()
            .any(|line| line.words.len() > 4096)
    {
        return Err(LyricsError::Response);
    }
    if lyrics.lines.iter().all(|line| line.words.trim().is_empty()) {
        return Ok(None);
    }
    let mut lines: Vec<_> = lyrics
        .lines
        .into_iter()
        .map(|line| Line {
            text: line.words,
            start_ms: timestamp(&line.start_time_ms),
        })
        .collect();
    let synchronized = matches!(lyrics.sync_type.as_str(), "LINE_SYNCED" | "SYLLABLE_SYNCED")
        && lines.iter().all(|line| line.start_ms.is_some())
        && lines.windows(2).all(|pair| pair[0].start_ms <= pair[1].start_ms);
    if !synchronized {
        lines.iter_mut().for_each(|line| line.start_ms = None);
    }
    let background = payload
        .colors["background"]
        .as_i64()
        .filter(|n| (i64::from(i32::MIN)..=i64::from(u32::MAX)).contains(n))
        .map(|n| (n as u32) & 0x00ff_ffff);
    Ok(Some(Lyrics {
        lines,
        synchronized,
        provider: lyrics.provider_display_name.chars().take(120).collect(),
        background,
        right_to_left: lyrics.is_rtl_language,
    }))
}

pub async fn fetch(session: &Session, uri: &str) -> Result<Option<Lyrics>, LyricsError> {
    if !uri
        .strip_prefix("spotify:track:")
        .is_some_and(|id| id.len() == 22 && id.bytes().all(|b| b.is_ascii_alphanumeric()))
    {
        return Err(LyricsError::InvalidTrack);
    }
    let Ok(SpotifyUri::Track { id }) = SpotifyUri::from_uri(uri) else {
        return Err(LyricsError::InvalidTrack);
    };
    match tokio::time::timeout(Duration::from_secs(12), session.spclient().get_lyrics(&id)).await {
        Ok(Ok(body)) => parse(&body),
        Ok(Err(error)) => match error.kind {
            ErrorKind::NotFound => Ok(None),
            ErrorKind::PermissionDenied | ErrorKind::Unauthenticated => {
                Err(LyricsError::Unavailable)
            }
            _ => Err(LyricsError::Network),
        },
        Err(_) => Err(LyricsError::Network),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn line_timestamps_accept_strings_and_numbers_and_preserve_instrumental_breaks() {
        let lyrics = parse(br#"{"lyrics":{"syncType":"LINE_SYNCED","lines":[{"words":"Une phrase","startTimeMs":"100"},{"words":"","startTimeMs":500}],"providerDisplayName":"Example"},"colors":{"background":-16776961}}"#)
            .unwrap()
            .unwrap();
        assert!(lyrics.synchronized);
        assert_eq!(lyrics.lines[0].start_ms, Some(100));
        assert_eq!(lyrics.lines[1].start_ms, Some(500));
        assert_eq!(lyrics.lines[1].text, "");
        assert_eq!(lyrics.background, Some(255));
    }

    #[test]
    fn plain_or_invalid_timestamps_keep_the_text_in_order() {
        for mode in ["UNSYNCED", "LINE_SYNCED"] {
            let data = format!(
                r#"{{"lyrics":{{"syncType":"{mode}","lines":[{{"words":"First","startTimeMs":500}},{{"words":"Second","startTimeMs":"-1"}}],"isRtlLanguage":true}}}}"#
            );
            let lyrics = parse(data.as_bytes()).unwrap().unwrap();
            assert!(!lyrics.synchronized);
            assert!(lyrics.right_to_left);
            assert!(lyrics.lines.iter().all(|line| line.start_ms.is_none()));
            assert_eq!(lyrics.lines[0].text, "First");
        }
    }

    #[test]
    fn absent_lyrics_are_distinguished_from_an_oversized_or_unparseable_response() {
        assert!(parse(br#"{"lyrics":null}"#).unwrap().is_none());
        assert!(
            parse(br#"{"lyrics":{"syncType":"UNSYNCED","lines":[]}}"#)
                .unwrap()
                .is_none()
        );
        assert!(parse(b"not json").is_err());
        assert!(parse(&vec![0; 512 * 1024 + 1]).is_err());
    }
}

# MuzjetAI — Audio & Scene Editor Update

## AI Video Studio
- Scene clips are now displayed as a vertical, scrollable editor in the right sidebar beside the preview.
- Audio preflight appears before creating the video draft.
- Voice options: local Kokoro AI voice, uploaded voice, or no voice.
- Music options: original generated music, free library music, or no music.
- Generated voice and music are real WAV assets, not preview-only oscillators.
- Preview playback synchronizes voice and background music.
- Existing stock-media, captions, scene effects and auto-save workflows remain intact.

## Video Maker
- Added an audio setup area before MP4 creation.
- Select AI voice, uploaded voice, or no voice.
- Select original generated music, uploaded music, or no music.
- AI voice and original music are generated automatically when needed and inserted into the actual MP4 export.
- If the script or music mood changes, the AI audio is regenerated before export.
- Existing uploaded audio workflow remains supported.

## Shared audio engine
`shared/audio-tools.js` contains the browser-local Kokoro voice generator and original WAV music generator. It does not require a paid TTS or music API.

## Final MP4 workflow
AI Video Studio now has “Open in Video Maker”. It transfers scene media, durations, generated/uploaded voice and music through IndexedDB, then opens Video Maker with everything loaded. Video Maker exports the finished result as MP4. JSON remains only as an optional project backup/import format and is not required to download a video.

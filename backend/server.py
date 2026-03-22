import json
import os
import tempfile
from pathlib import Path

import httpx
import librosa
import numpy as np
import soundfile as sf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# 1. Load Environment Variables
try:
    from dotenv import load_dotenv

    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded .env from {env_path}")
except ImportError:
    pass

app = FastAPI(title="Tempo Backend Server")

# 2. Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════
# MIDI PROXY (Solves CORS errors for remote MIDI files)
# ══════════════════════════════════════════════════════

BROWSER_LIKE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "audio/midi,audio/*;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.romwell.com/",
    "Connection": "keep-alive",
}


@app.get("/api/proxy-midi")
async def proxy_midi(url: str):
    """
    Fetches MIDI from a remote site and returns it from localhost
    so the frontend can load it without CORS issues.
    """
    try:
        print(f"Proxy Request: {url}")

        async with httpx.AsyncClient(
            headers=BROWSER_LIKE_HEADERS,
            follow_redirects=True,
            timeout=20.0,
        ) as client:
            response = await client.get(url)

        if response.status_code != 200:
            print(f"Remote site error: {response.status_code} for {url}")
            raise HTTPException(
                status_code=502,
                detail=f"Remote site returned {response.status_code}",
            )

        content_type = response.headers.get("content-type", "").lower()

        if "html" in content_type:
            print(f"Remote site returned HTML instead of MIDI for {url}")
            raise HTTPException(
                status_code=502,
                detail="Remote site returned HTML instead of a MIDI file",
            )

        return Response(
            content=response.content,
            media_type="audio/midi",
            headers={
                "Content-Disposition": "attachment; filename=track.mid",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
            },
        )

    except httpx.RequestError as e:
        print(f"Proxy Request Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Proxy request failed: {str(e)}")

    except HTTPException:
        raise

    except Exception as e:
        print(f"Proxy Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Proxy failed: {str(e)}")


# ══════════════════════════════════════════════════════
# LOCAL RHYTHM GENERATION & MIXING
# ══════════════════════════════════════════════════════

@app.post("/api/generate-backing-track")
async def generate_backing_track(user_audio: UploadFile = File(...)):
    """
    Analyzes piano recording for BPM and adds a sharp click track.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_in:
        tmp_in.write(await user_audio.read())
        input_path = tmp_in.name

    output_path = None

    try:
        print("Processing audio for rhythm analysis...")
        y, sr = librosa.load(input_path, sr=None)

        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        tempo_value = float(np.atleast_1d(tempo)[0])
        detected_bpm = round(tempo_value)

        print(f"BPM: {detected_bpm}")

        if len(beat_frames) == 0:
            print("Forcing metronome fallback...")
            safe_bpm = detected_bpm if detected_bpm > 0 else 120
            beat_samples = np.arange(0, len(y), int(sr * 60 / safe_bpm))
            beat_frames = librosa.samples_to_frames(beat_samples)

        clicks = librosa.clicks(
            frames=beat_frames,
            sr=sr,
            length=len(y),
            click_freq=1000.0,
            click_duration=0.1,
        )

        mixed = (y * 0.5) + (clicks * 1.0)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_out:
            output_path = tmp_out.name

        sf.write(output_path, mixed, sr)
        print("Mix complete.")

        return FileResponse(output_path, media_type="audio/wav", filename="backing_track.wav")

    except Exception as e:
        print(f"Mix Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if os.path.exists(input_path):
            os.remove(input_path)


# ══════════════════════════════════════════════════════
# OPENAI COACHING & WEBSOCKET
# ══════════════════════════════════════════════════════

SYSTEM_PROMPT = "You are Tempo Coach. Give brief (2 sentence) piano tips."


async def stream_coach_response(websocket: WebSocket, user_message: str):
    api_key = os.getenv("OPENAI_API_KEY", "")

    if not api_key:
        await websocket.send_text(
            json.dumps(
                {
                    "action": "coach_response",
                    "text": "Set API Key!",
                    "done": True,
                }
            )
        )
        return

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "stream": True,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                },
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    await websocket.send_text(
                        json.dumps(
                            {
                                "action": "coach_response",
                                "text": f"OpenAI error: {error_text.decode(errors='ignore')}",
                                "done": True,
                            }
                        )
                    )
                    return

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data = line[6:]

                    if data == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data)
                        txt = chunk["choices"][0]["delta"].get("content", "")
                        if txt:
                            await websocket.send_text(
                                json.dumps({"action": "coach_chunk", "text": txt})
                            )
                    except Exception:
                        pass

        await websocket.send_text(json.dumps({"action": "coach_done"}))

    except Exception as e:
        await websocket.send_text(
            json.dumps(
                {
                    "action": "coach_response",
                    "text": str(e),
                    "done": True,
                }
            )
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_notes = {}

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            m_type = msg.get("type")

            if m_type == "note_on":
                active_notes[msg.get("note")] = msg.get("time")

            elif m_type == "note_off":
                note = msg.get("note")
                if note in active_notes:
                    start = active_notes.pop(note)
                    dur = round((msg.get("time") - start) / 1000, 3)
                    await websocket.send_text(
                        json.dumps(
                            {
                                "action": "processed_note",
                                "note": note,
                                "duration_seconds": dur,
                            }
                        )
                    )

            elif m_type == "coach_request":
                await stream_coach_response(
                    websocket,
                    msg.get("message", "Ready to play"),
                )

    except WebSocketDisconnect:
        print("WebSocket Disconnected")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
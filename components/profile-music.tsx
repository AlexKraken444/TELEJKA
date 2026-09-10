"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "./shared";
import { uploadFiles, type Attachment } from "./media";
import { from64 } from "@/lib/crypto-chat";
export function ProfileMusic({
  userId,
  editable = false,
  enabled = false,
}: {
  userId: string;
  editable?: boolean;
  enabled?: boolean;
}) {
  const [track, setTrack] = useState<Attachment | null>(null),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Attachment | null>("users/" + userId + "/music")
      .then((t) => {
        if (active) setTrack(t);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, enabled]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function load() {
    if (!track || busy) return;
    setBusy(true);
    try {
      const info = await api<{ chunks: number; size: number }>(
        "uploads/" + track.id,
      );
      if (info.size > 26214416 || info.chunks > 101)
        throw Error("Файл слишком большой.");
      const bytes = new Uint8Array(info.size);
      for (let i = 0; i < info.chunks; i++) {
        const c = await api<{ data: string }>("uploads/" + track.id + "/" + i);
        bytes.set(from64(c.data), i * 262144);
      }
      setUrl(URL.createObjectURL(new Blob([bytes], { type: track.mime })));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return !editable && !track ? null : (
    <section className="profile-music">
      <div className="music-heading">
        <span className="music-note">♫</span>
        <div>
          <strong>Музыка профиля</strong>
          <p>{track?.name || "Добавь любимую композицию"}</p>
        </div>
      </div>
      {track &&
        (url ? (
          <audio
            controls
            src={url}
            preload="metadata"
            aria-label={track.name}
          />
        ) : (
          <button className="secondary" disabled={busy} onClick={load}>
            {busy ? "Загрузка…" : "▶ Открыть плеер"}
          </button>
        ))}
      {editable && (
        <div className="music-controls">
          <label className="secondary">
            {busy ? "Загрузка…" : track ? "Заменить музыку" : "Добавить музыку"}
            <input
              type="file"
              aria-label="Добавить музыку в профиль"
              accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav,audio/webm"
              disabled={busy || !enabled}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 25 * 1024 * 1024 || !f.size) {
                  setError("Размер аудио — до 25 МБ.");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const [a] = await uploadFiles([f]);
                  await api("me/music", "POST", { uploadId: a.id });
                  setTrack(a);
                  setUrl("");
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {track && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("me/music", "DELETE");
                  setTrack(null);
                  setUrl("");
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Убрать
            </button>
          )}
          <small>
            {enabled
              ? "MP3, M4A, OGG, WAV, WebM · до 25 МБ"
              : "Доступно с TELEJKA+"}
          </small>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

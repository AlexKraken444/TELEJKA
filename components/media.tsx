"use client";
import { useEffect, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { api, errorText } from "./shared";
import { bytes64, from64, encryptFile, decryptFile } from "@/lib/crypto-chat";
export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  key?: string;
  iv?: string;
};
const publicTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];
export function FilePicker({
  files,
  onChange,
  disabled = false,
  chat = false,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  disabled?: boolean;
  chat?: boolean;
}) {
  const [error, setError] = useState("");
  return (
    <div className="file-picker">
      <label className="secondary">
        <Paperclip size={17} />
        <span>{chat ? "Файлы" : "Фото / видео"}</span>
        <input
          type="file"
          multiple
          disabled={disabled}
          accept={chat ? undefined : publicTypes.join(",")}
          onChange={(e) => {
            const incoming = [...files, ...Array.from(e.target.files ?? [])];
            e.target.value = "";
            if (incoming.length > 4) {
              setError("Можно прикрепить до 4 файлов.");
              return;
            }
            if (
              incoming.some((f) => f.size === 0 || f.size > 25 * 1024 * 1024)
            ) {
              setError("Размер каждого файла: от 1 байта до 25 МБ.");
              return;
            }
            if (!chat && incoming.some((f) => !publicTypes.includes(f.type))) {
              setError("Выберите фото или видео поддерживаемого формата.");
              return;
            }
            setError("");
            onChange(incoming);
          }}
        />
      </label>
      {files.map((f, i) => (
        <button
          type="button"
          disabled={disabled}
          className="file-chip"
          key={i}
          onClick={() => onChange(files.filter((_, j) => i !== j))}
        >
          {f.name}
          <X size={13} />
        </button>
      ))}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export async function uploadFiles(
  files: File[],
  chatId: string | null = null,
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const encrypted = chatId ? await encryptFile(buffer) : null;
    const data = encrypted?.data ?? new Uint8Array(buffer);
    const upload = await api<{ id: string; chunks: number }>(
      "uploads",
      "POST",
      {
        name: chatId ? "encrypted" : file.name.slice(0, 160),
        mime: chatId ? "application/octet-stream" : file.type,
        size: data.byteLength,
        chatId,
      },
    );
    for (let i = 0; i < upload.chunks; i++)
      await api(`uploads/${upload.id}/${i}`, "POST", {
        data: bytes64(data.slice(i * 262144, (i + 1) * 262144)),
      });
    await api(`uploads/${upload.id}/complete`, "POST", {});
    attachments.push({
      id: upload.id,
      name: file.name.slice(0, 160),
      mime: file.type,
      size: file.size,
      ...(encrypted ? { key: encrypted.key, iv: encrypted.iv } : {}),
    });
  }
  return attachments;
}
export function MediaList({ items = [] }: { items?: Attachment[] }) {
  return (
    <div className="media-list">
      {items.slice(0, 4).map((item) => (
        <Media key={item.id} item={item} />
      ))}
    </div>
  );
}
function Media({ item }: { item: Attachment }) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function load() {
    setBusy(true);
    setError("");
    try {
      const info = await api<{ chunks: number; size: number }>(
        `uploads/${item.id}`,
      );
      if (info.size > 26214416 || info.chunks > 101)
        throw Error("Недопустимый размер файла.");
      const data = new Uint8Array(info.size);
      for (let i = 0; i < info.chunks; i++) {
        const chunk = await api<{ data: string }>(`uploads/${item.id}/${i}`);
        data.set(from64(chunk.data), i * 262144);
      }
      const plain =
        item.key && item.iv ? await decryptFile(data, item.key, item.iv) : data;
      const mime = publicTypes.includes(item.mime)
        ? item.mime
        : "application/octet-stream";
      setUrl(
        URL.createObjectURL(new Blob([plain as BlobPart], { type: mime })),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="media-item">
      {url ? (
        <>
          {publicTypes.includes(item.mime) && item.mime.startsWith("image/") ? (
            <img src={url} alt={item.name} />
          ) : publicTypes.includes(item.mime) &&
            item.mime.startsWith("video/") ? (
            <video src={url} controls preload="metadata" />
          ) : null}
          <a className="text-button" href={url} download={item.name}>
            Скачать {item.name}
          </a>
        </>
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={load}
        >
          <Paperclip size={16} />
          {busy ? "Загружаем…" : item.name} · {(item.size / 1048576).toFixed(1)}{" "}
          МБ
        </button>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, X } from "lucide-react";
import { api, errorText } from "./shared";
import {
  identityFor,
  exportBackup,
  importBackup,
  fingerprint,
} from "@/lib/crypto-chat";
export async function registerDevice(userId: string) {
  const identity = await identityFor(userId);
  await api("devices", "POST", {
    id: identity.id,
    publicKey: identity.publicKey,
  });
  return identity;
}
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  return (
    <button
      type="button"
      className="secondary theme-toggle"
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
      onClick={() => {
        const value = !dark;
        setDark(value);
        document.documentElement.dataset.theme = value ? "dark" : "light";
        try {
          localStorage.setItem("telejka-theme", value ? "dark" : "light");
        } catch {}
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? "Светлая тема" : "Тёмная тема"}</span>
    </button>
  );
}
type Notice = { id: string; conversation_id: string; name: string };
export function Notifications({
  userId,
  onOpen,
}: {
  userId: string;
  onOpen: (id: string) => void;
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    let alive = true,
      inFlight = false;
    registerDevice(userId).catch(() => {});
    const poll = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const rows = await api<Notice[]>("notifications", "POST", {});
        if (alive) setNotices((old) => [...old, ...rows].slice(-30));
      } catch {
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const interval = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [userId]);
  return (
    <div className="notifications" aria-live="polite">
      {notices.map((n) => (
        <div className="notification" key={n.id}>
          <button
            onClick={() => {
              onOpen(n.conversation_id);
              setNotices((old) => old.filter((x) => x.id !== n.id));
            }}
          >
            <strong>{n.name}</strong>
            <span>Новое сообщение</span>
          </button>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={() =>
              setNotices((old) => old.filter((x) => x.id !== n.id))
            }
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
export function KeyBackup({ userId }: { userId: string }) {
  const [password, setPassword] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [print, setPrint] = useState("");
  useEffect(() => {
    identityFor(userId)
      .then((i) => fingerprint(i.publicKey))
      .then(setPrint)
      .catch((e) => setStatus(errorText(e)));
  }, [userId]);
  return (
    <section className="security-panel">
      <h3>Ключи переписки</h3>
      <p>
        Сохраните резервную копию ключа, чтобы читать сообщения на другом
        устройстве. Очистка данных браузера без копии приведёт к потере доступа
        к зашифрованной истории.
      </p>
      <code>{print}</code>
      <label className="field-label">
        Пароль резервной копии
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="От 12 символов, хранится только у вас"
        />
      </label>
      <div className="security-actions">
        <button
          className="secondary"
          disabled={busy || password.length < 12}
          onClick={async () => {
            setBusy(true);
            try {
              const text = await exportBackup(userId, password);
              const url = URL.createObjectURL(
                new Blob([text], { type: "application/json" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "telejka-key.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
              setStatus("Копия ключа сохранена. Храните пароль отдельно.");
              setPassword("");
            } catch (e) {
              setStatus(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Сохранить ключ
        </button>
        <label className="secondary file-picker">
          Восстановить ключ
          <input
            type="file"
            accept=".json"
            disabled={busy || password.length < 12}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                if (file.size > 30000) throw Error("Неверный файл ключа.");
                await importBackup(userId, password, await file.text());
                await registerDevice(userId);
                window.location.reload();
              } catch (e) {
                setStatus(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  );
}

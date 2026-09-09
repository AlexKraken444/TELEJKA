"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, X } from "lucide-react";
import { api } from "./shared";
import { identityFor } from "@/lib/crypto-chat";
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

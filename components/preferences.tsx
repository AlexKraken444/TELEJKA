"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { halloweenActive } from "./seasonal-theme";
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
 const [theme,setTheme]=useState('light'),[season,setSeason]=useState(false);
 useEffect(()=>{const sync=()=>{setTheme(document.documentElement.dataset.theme||'light');setSeason(halloweenActive(Date.now()))};sync();const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const timer=setInterval(sync,1000);return()=>{observer.disconnect();clearInterval(timer)}},[]);
 return <label className="theme-picker"><span>Тема</span><select aria-label="Тема оформления" value={theme} onChange={e=>{const value=e.target.value;setTheme(value);document.documentElement.dataset.theme=value;try{localStorage.setItem('telejka-theme',value)}catch{}}}><option value="light">Светлая</option><option value="dark">Тёмная</option>{season&&<option value="halloween">Хэллоуин</option>}</select></label>;
}
type Notice = { id: string; conversation_id: string; channel_id?: string; name: string };
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
              if(n.channel_id)window.location.assign('/feed?channel='+encodeURIComponent(n.channel_id));else onOpen(n.conversation_id);
              setNotices((old) => old.filter((x) => x.id !== n.id));
            }}
          >
            <strong>{n.name}</strong>
            <span>{n.channel_id?'Новая публикация в канале':'Новое сообщение'}</span>
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

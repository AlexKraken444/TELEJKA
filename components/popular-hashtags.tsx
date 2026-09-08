"use client";
import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { api } from "./shared";
type Hashtag = { tag: string; posts: number };
export function PopularHashtags() {
  const [tags, setTags] = useState<Hashtag[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.hidden) return;
      try {
        const data = await api<Hashtag[]>("hashtags");
        if (active) { setTags(data); setFailed(false); }
      } catch { if (active) setFailed(true); }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("telejka-posts-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("telejka-posts-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return <section className="popular-hashtags" aria-label="Популярные хэштеги">
    <div className="right-title"><h3>Популярные хэштеги</h3><Hash size={17}/></div>
    {failed && <p className="muted small" role="status">Не удалось обновить хэштеги.</p>}
    <ol className="hashtag-list">{tags.map((item, index) => <li key={item.tag}>
      <span className="hashtag-rank">{index + 1}</span>
      <div><strong>#{item.tag}</strong><small>Постов: {item.posts}</small></div>
    </li>)}</ol>
  </section>;
}

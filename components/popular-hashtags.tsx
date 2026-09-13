"use client";
import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import {MediaList} from "./media";
import type {Post} from "@/lib/types";
import {createPortal} from "react-dom";
import { api } from "./shared";
type Hashtag = { tag: string; posts: number };
export function PopularHashtags() {
  const [selected,setSelected]=useState("");
  const [results,setResults]=useState<Post[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState("");
  async function show(tag:string,offset=0){setSelected(tag);setLoading(true);setError("");if(!offset)setResults([]);try{const data=await api<{posts:Post[];total:number}>("hashtag?tag="+encodeURIComponent(tag)+"&offset="+offset);setResults(old=>offset?[...old,...data.posts]:data.posts);setTotal(data.total)}catch{setError("Не удалось загрузить публикации.")}finally{setLoading(false)}}
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
      <button onClick={()=>void show(item.tag)}><strong>#{item.tag}</strong><small>Постов: {item.posts}</small></button>
    </li>)}</ol>
{selected&&createPortal(<div className="modal-backdrop" onClick={()=>setSelected("")}><section className="modal hashtag-results" role="dialog" aria-modal="true" aria-label={"#"+selected} onClick={e=>e.stopPropagation()}><header><h2>#{selected}</h2><button onClick={()=>setSelected("")} aria-label="Закрыть">×</button></header><p>Публикаций: {total}</p>{error&&<p role="alert">{error}</p>}{results.map(post=><article key={post.id}><strong>{post.author.name}</strong><small>{new Date(post.created_at).toLocaleString('ru')}</small><p>{post.body}</p><MediaList items={post.attachments||[]}/></article>)}{loading?<p role="status">Загрузка…</p>:results.length<total&&<button onClick={()=>void show(selected,results.length)}>Показать ещё</button>}</section></div>,document.body)}
  </section>;
}

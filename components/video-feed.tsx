"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Heart,
  MessageCircle,
  X,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  Repeat2,
} from "lucide-react";
import type { Post, User, Comment } from "@/lib/types";
import { api, errorText, Avatar, UserName, time } from "./shared";
import { loadAttachment, MediaList, type Attachment } from "./media";
import { EditContent, ShareButton } from "./content-tools";
type Clip = { post: Post; file: Attachment };
const clips = (posts: Post[]): Clip[] =>
  posts.flatMap((post) =>
    (post.attachments || [])
      .filter((file) => file.mime.startsWith("video/"))
      .map((file) => ({ post, file })),
  );

export function VideoFeed({
  initial,
  embedded = false,
  fileId,
  user,
  onClose,
  onPerson,
}: {
  initial?: Post;
  embedded?: boolean;
  fileId?: string;
  user: User;
  onClose: () => void;
  onPerson: (user: User) => void;
}) {
  const first = initial ? clips([initial]).find((c) => c.file.id === fileId) : undefined;
  const [items, setItems] = useState<Clip[]>(first ? [first] : []),
    [active, setActive] = useState(0),
    [muted, setMuted] = useState(true),
    [error, setError] = useState(""),
    [comments, setComments] = useState<Post | null>(null),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(true);
  const list = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null),
    offset = useRef(0),
    pending = useRef(false),
    alive = useRef(true),
    hasMore = useRef(true);
  async function loadMore() {
    if (pending.current || !hasMore.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const posts = await api<Post[]>(
        "posts?videos=true&offset=" + offset.current,
      );
      if (!alive.current) return;
      offset.current += posts.length;
      hasMore.current = posts.length === 20;
      setMore(hasMore.current);
      setItems((current) => {
        const ids = new Set(current.map((c) => c.file.id));
        return [...current, ...clips(posts).filter((c) => !ids.has(c.file.id))];
      });
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      pending.current = false;
      if (alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    const old = document.body.style.overflow;
    const previous = document.activeElement as HTMLElement | null;
    if (!embedded) document.body.style.overflow = "hidden";
    close.current?.focus();
    void loadMore();
    return () => {
      alive.current = false;
      if (!embedded) document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (active >= items.length - 3) void loadMore();
  }, [active, items.length]);
  useEffect(()=>{
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean}}).connection;
    if(connection?.saveData)return;
    const next=items[active+1];if(!next)return;
    const timer=setTimeout(()=>{void loadAttachment(next.file).catch(()=>{});},1200);
    return ()=>clearTimeout(timer);
  },[active,items]);
  function move(delta: number) {
    list.current?.scrollTo({
      top:
        Math.max(0, Math.min(items.length - 1, active + delta)) *
        list.current.clientHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  function updated(id: string, patch: Partial<Post>) {
    setItems((current) =>
      current.map((c) =>
        c.post.id === id ? { ...c, post: { ...c.post, ...patch } } : c,
      ),
    );
  }
  const content = (
    <section
      className={`video-feed-overlay ${embedded ? "video-feed-embedded" : ""}`}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label="Лента видео"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest(".modal-backdrop")) return;
        if (e.key === "Tab" && (!embedded || comments)) {
          const scope = comments
            ? e.currentTarget.querySelector(".video-comments")!
            : e.currentTarget;
          const buttons = Array.from(
            scope.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,summary,a[href]",
            ),
          ).filter((el) => el.getClientRects().length);
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              !scope.contains(document.activeElement))
          ) {
            e.preventDefault();
            last?.focus();
          } else if (
            !e.shiftKey &&
            (document.activeElement === last ||
              !scope.contains(document.activeElement))
          ) {
            e.preventDefault();
            first?.focus();
          }
        }
        const tag = (e.target as HTMLElement).tagName;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
        if (e.key === "Escape") {
          comments ? setComments(null) : onClose();
        }
        if (!comments && ["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          move(e.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <header className="video-feed-top">
        <button ref={close} onClick={onClose} aria-label="Закрыть ленту видео">
          <X />
        </button>
        <strong>Лента видосиков</strong>
        <button
          onClick={() => setMuted((v) => !v)}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </header>
      <div
        className="video-feed-pages"
        ref={list}
        style={comments ? { overflowY: "hidden" } : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollTop / el.clientHeight));
        }}
      >
        {items.map((clip, index) => (
          <article
            className="video-feed-page"
            key={clip.file.id}
            aria-label={`Видео ${index + 1}`}
          >
            {index === active && (
              <ClipPlayer file={clip.file} muted={muted} paused={!!comments} />
            )}
            {index === active && (
              <>
                <div className="video-feed-caption">
                  <button onClick={() => onPerson(clip.post.author)}>
                    <Avatar user={clip.post.author} size={36} />
                    <UserName user={clip.post.author} />
                  </button>
                  <details>
                    <summary>
                      {clip.post.body.slice(0, 100) || clip.file.name}
                      {clip.post.body.length > 100 ? "…" : ""}
                    </summary>
                    {clip.post.body.length > 100 && <p>{clip.post.body}</p>}
                  </details>
                </div>
                <VideoActions
                  post={clip.post}
                  user={user}
                  update={(patch) => updated(clip.post.id, patch)}
                  onComments={() => setComments(clip.post)}
                />
              </>
            )}
          </article>
        ))}
      </div>
      <div className="video-feed-nav">
        <button
          disabled={active === 0}
          onClick={() => move(-1)}
          aria-label="Предыдущее видео"
        >
          <ChevronUp />
        </button>
        <button
          disabled={active >= items.length - 1}
          onClick={() => move(1)}
          aria-label="Следующее видео"
        >
          <ChevronDown />
        </button>
      </div>
      {(items.length === 0 || active === items.length - 1) && (
        <div className="video-feed-status">
          {loading ? (
            "Загружаем ещё…"
          ) : error ? (
            <>
              <span role="alert">{error}</span>
              <button onClick={() => void loadMore()}>Повторить</button>
            </>
          ) : more ? (
            <button onClick={() => void loadMore()}>Загрузить ещё видео</button>
          ) : (
            <small>{items.length ? "Пока это последнее видео" : "Пока нет видео. Добавь ролик в основную ленту."}</small>
          )}
        </div>
      )}
      {comments && (
        <VideoComments
          post={comments}
          user={user}
          onClose={() => setComments(null)}
          onCount={(delta) => {
            setItems((current) =>
              current.map((c) =>
                c.post.id === comments.id
                  ? {
                      ...c,
                      post: {
                        ...c.post,
                        comments: Math.max(0, c.post.comments + delta),
                      },
                    }
                  : c,
              ),
            );
          }}
        />
      )}
    </section>
  );
  return embedded ? content : createPortal(content, document.body);
}
function ClipPlayer({
  file,
  muted,
  paused,
}: {
  file: Attachment;
  muted: boolean;
  paused: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let live = true,
      object = "";
    void loadAttachment(file)
      .then((blob) => {
        if (live) {
          object = URL.createObjectURL(blob);
          setUrl(object);
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
      video.current?.pause();
      if (object) URL.revokeObjectURL(object);
    };
  }, [file.id]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (paused) el.pause();
    else
      void el
        .play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
  }, [url, paused, muted]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) video.current?.pause();
      else if (!paused)
        void video.current?.play().catch(() => setBlocked(true));
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [paused]);
  return (
    <>
      {url ? (
        <video
          ref={video}
          src={url}
          muted={muted}
          playsInline
          loop
          controls
          preload="auto"
          onError={() =>
            setError(
              "Не удалось воспроизвести видео. Попробуй скачать оригинал.",
            )
          }
        />
      ) : (
        <p className="video-loading" role="status">
          {error || "Загружаем видео…"}
        </p>
      )}
      {url && error && (
        <p className="video-loading" role="alert">
          {error}
          <a href={url} download={file.name}>
            Скачать видео
          </a>
        </p>
      )}
      {blocked && url && (
        <button
          className="video-play"
          onClick={() =>
            void video.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setError("Нажми кнопку воспроизведения в плеере."))
          }
        >
          ▶ Смотреть
        </button>
      )}
    </>
  );
}
function VideoActions({
  post,
  user,
  update,
  onComments,
}: {
  post: Post;
  user: User;
  update: (patch: Partial<Post>) => void;
  onComments: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reposted, setReposted] = useState(false);
  return (
    <div className="video-feed-actions">
      <button
        aria-label={post.liked ? "Убрать лайк" : "Поставить лайк"}
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await api("posts/" + post.id + "/like", "POST", {
              liked: !post.liked,
            });
            update({
              liked: !post.liked,
              likes: Math.max(0, post.likes + (post.liked ? -1 : 1)),
            });
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Heart fill={post.liked ? "#ff5f7e" : "none"} />
        <span>{post.likes}</span>
      </button>
      <button onClick={onComments} aria-label="Комментарии">
        <MessageCircle />
        <span>{post.comments}</span>
      </button>
      <ShareButton
        userId={user.id}
        author={post.author.name}
        content={{ body: post.body, attachments: post.attachments || [] }}
      />
      <button
        disabled={busy || reposted}
        aria-label="Репост"
        onClick={async () => {
          setBusy(true);
          try {
            await api("posts/" + post.id + "/repost", "POST", {});
            setReposted(true);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Repeat2 />
        <span>{reposted ? "Готово" : "Репост"}</span>
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
function VideoComments({
  post,
  user,
  onClose,
  onCount,
}: {
  post: Post;
  user: User;
  onClose: () => void;
  onCount: (delta: number) => void;
}) {
  const [items, setItems] = useState<Comment[]>([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(false);
  const alive = useRef(true),
    pending = useRef(false),
    input = useRef<HTMLInputElement>(null);
  async function load(offset = 0) {
    setLoading(true);
    try {
      const rows = await api<Comment[]>(
        `posts/${post.id}/comments?offset=${offset}`,
      );
      if (alive.current) {
        setItems((v) => (offset ? [...v, ...rows] : rows));
        setMore(rows.length === 50);
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [post.id]);
  return (
    <section className="video-comments" aria-label="Комментарии к видео">
      <header>
        <h2>Комментарии</h2>
        <button onClick={onClose} aria-label="Закрыть комментарии">
          <X />
        </button>
      </header>
      <div className="video-comments-list">
        {items.map((c) => (
          <article key={c.id}>
            <Avatar user={c.author} size={32} />
            <div>
              <strong>
                <UserName user={c.author} />
              </strong>
              <p>{c.body}</p>
              <MediaList items={c.attachments} />
              <small>
                {time(c.created_at)}
                {c.edited_at ? " · отредактировано" : ""}
              </small>
              {c.author.id === user.id && (
                <div className="content-tools">
                  <EditContent
                    body={c.body}
                    maxLength={1000}
                    onSave={async (body) => {
                      await api(`posts/${post.id}/comments/${c.id}`, "PATCH", {
                        body,
                      });
                      await load();
                    }}
                  />
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (!confirm("Удалить комментарий?")) return;
                      setBusy(true);
                      try {
                        await api(
                          `posts/${post.id}/comments/${c.id}`,
                          "DELETE",
                        );
                        onCount(-1);
                        await load();
                      } catch (e) {
                        setError(errorText(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
        {loading ? (
          <p>Загружаем…</p>
        ) : (
          !items.length && <p>Пока нет комментариев. Напиши первым.</p>
        )}
        {more && (
          <button disabled={loading} onClick={() => void load(items.length)}>
            Ещё комментарии
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current || !body.trim()) return;
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            await api(`posts/${post.id}/comments`, "POST", { body });
            if (alive.current) {
              setBody("");
              onCount(1);
              await load();
            }
          } catch (e) {
            if (alive.current) setError(errorText(e));
          } finally {
            pending.current = false;
            if (alive.current) setBusy(false);
          }
        }}
      >
        <input
          ref={input}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Добавить комментарий…"
          aria-label="Комментарий"
          maxLength={1000}
        />
        <button disabled={busy || !body.trim()}>Отправить</button>
      </form>
    </section>
  );
}

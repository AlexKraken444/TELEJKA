"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";
import { FilePicker, MediaList, uploadFiles, type Attachment } from "./media";
import { api, errorText, UserName } from "./shared";
type Channel = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  subscribers: number;
  subscribed: boolean;
  notifications: boolean;
};
type Entry = {
  id: string;
  body: string;
  created_at: string;
  comment_count: number;
  attachments: Attachment[];
};
export function Channels({ user }: { user: User }) {
  const [channels, setChannels] = useState<Channel[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [channel, setChannel] = useState<Channel | null>(null),
    [posts, setPosts] = useState<Entry[]>([]),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [body, setBody] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  const postRequest=useRef<string|null>(null);
  const loadList = () => api<Channel[]>("channels").then(setChannels);
  async function load(id: string) {
    const [c, p] = await Promise.all([
      api<Channel>("channels/" + id),
      api<Entry[]>("channels/" + id + "/posts"),
    ]);
    setChannel(c);
    setPosts(p);
  }
  useEffect(() => {
    loadList().catch((e) => setError(errorText(e)));
    const id = new URLSearchParams(location.search).get("channel");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setSelected(id);
  }, []);
  useEffect(() => {
    setChannel(null);
    setPosts([]);
    if (!selected) return;
    let active = true;
    const refresh = async () => {
      try {
        const [c, p] = await Promise.all([
          api<Channel>("channels/" + selected),
          api<Entry[]>("channels/" + selected + "/posts"),
        ]);
        if (active) {
          setChannel(c);
          setPosts(p);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      }
    };
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected]);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="channels-view section-pad">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!selected ? (
        <>
          <div className="channel-toolbar">
            <h2>Каналы</h2>
            {user.plus_active && (
              <button
                className="secondary"
                onClick={() => setCreating(!creating)}
              >
                Создать канал
              </button>
            )}
          </div>
          {creating && (
            <form
              className="settings-card"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  const c = await api<Channel>("channels", "POST", {
                    title,
                    description,
                  });
                  setCreating(false);
                  setTitle("");
                  setDescription("");
                  await loadList();
                  setSelected(c.id);
                });
              }}
            >
              <label>
                Название
                <input
                  required
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Описание
                <textarea
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Создать
              </button>
            </form>
          )}
          <input
            aria-label="Поиск каналов"
            placeholder="Найти канал"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!channels.length && (
            <p className="muted">Каналов пока нет. Создание доступно с PLUS.</p>
          )}
          {channels
            .filter((c) =>
              c.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )
            .map((c) => (
              <button
                className="channel-row"
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <strong>{c.title}</strong>
                <small>
                  {c.subscribers} подписчиков{" "}
                  {c.subscribed ? "· Вы подписаны" : ""}
                </small>
              </button>
            ))}
        </>
      ) : (
        <>
          <button
            className="secondary"
            onClick={() => {
              setSelected(null);
              loadList().catch((e) => setError(errorText(e)));
            }}
          >
            ← Все каналы
          </button>
          {channel ? (
            <>
              <header className="channel-heading">
                <h2>{channel.title}</h2>
                <p>{channel.description}</p>
                <small>{channel.subscribers} подписчиков</small>
                <div className="channel-toolbar">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api(
                          "channels/" + channel.id + "/subscription",
                          "POST",
                          { subscribed: !channel.subscribed },
                        );
                        await load(channel.id);
                      })
                    }
                  >
                    {channel.subscribed ? "Отписаться" : "Подписаться"}
                  </button>
                  {channel.subscribed && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await api(
                            "channels/" + channel.id + "/subscription",
                            "POST",
                            {
                              subscribed: true,
                              notifications: !channel.notifications,
                            },
                          );
                          await load(channel.id);
                        })
                      }
                    >
                      {channel.notifications
                        ? "Уведомления включены"
                        : "Уведомления выключены"}
                    </button>
                  )}
                  {channel.owner_id === user.id && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Удалить канал и все публикации?"))
                          act(async () => {
                            await api("channels/" + channel.id, "DELETE");
                            setSelected(null);
                            await loadList();
                          });
                      }}
                    >
                      Удалить канал
                    </button>
                  )}
                </div>
              </header>
              {channel.owner_id === user.id && (
                <form
                  className="settings-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      if(!postRequest.current)postRequest.current=crypto.randomUUID();
                      const attachments = await uploadFiles(files);
                      await api("channels/" + channel.id + "/posts", "POST", {
                        attachmentIds: attachments.map((f) => f.id),
                        body,
                        requestId: postRequest.current,
                      });
                      setBody("");
                      setFiles([]);postRequest.current=null;
                      await load(channel.id);
                    });
                  }}
                >
                  <textarea
                    aria-label="Новая публикация"
                    placeholder="Новая публикация в канале"
                    maxLength={5000}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <FilePicker
                    files={files}
                    onChange={setFiles}
                    disabled={busy}
                  />
                  <button
                    className="primary"
                    disabled={busy || (!body.trim() && !files.length)}
                  >
                    Опубликовать
                  </button>
                </form>
              )}
              {!posts.length && <p className="muted">Публикаций пока нет.</p>}
              {posts.map((p) => (
                <article className="settings-card channel-post" key={p.id}>
                  <strong>{channel.title}</strong>
                  <p>{p.body}</p>
                  <MediaList items={p.attachments} />
                  <small>{new Date(p.created_at).toLocaleString("ru")}</small>
                  <ChannelComments
                    path={
                      "channels/" + channel.id + "/posts/" + p.id + "/comments"
                    }
                    count={p.comment_count}
                  />
                  {channel.owner_id === user.id && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Удалить публикацию?"))
                          act(async () => {
                            await api(
                              "channels/" + channel.id + "/posts/" + p.id,
                              "DELETE",
                            );
                            await load(channel.id);
                          });
                      }}
                    >
                      Удалить
                    </button>
                  )}
                </article>
              ))}
              {posts.length >= 30 && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const more = await api<Entry[]>(
                        "channels/" +
                          channel.id +
                          "/posts?before=" +
                          encodeURIComponent(posts.at(-1)!.created_at),
                      );
                      setPosts((old) => [
                        ...old,
                        ...more.filter((x) => !old.some((p) => p.id === x.id)),
                      ]);
                    })
                  }
                >
                  Ранее
                </button>
              )}
            </>
          ) : (
            <p>Загрузка канала…</p>
          )}
        </>
      )}
    </section>
  );
}
function ChannelComments({ path, count }: { path: string; count: number }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<{ id: string; body: string; author: User }[]>(
      [],
    ),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      api<typeof rows>(path)
        .then(setRows)
        .catch((e) => setError(errorText(e)));
  }, [open, path]);
  return (
    <div className="channel-comments">
      <button className="secondary" onClick={() => setOpen(!open)}>
        Комментарии · {open ? rows.length : count}
      </button>
      {open && (
        <>
          {error && <p className="error">{error}</p>}
          {rows.map((r) => (
            <div key={r.id}>
              <UserName user={r.author} />
              <p>{r.body}</p>
            </div>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await api(path, "POST", { body });
                setBody("");
                setRows(await api(path));
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <textarea
              aria-label="Комментарий"
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button className="primary" disabled={busy || !body.trim()}>
              Отправить
            </button>
          </form>
        </>
      )}
    </div>
  );
}

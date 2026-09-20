"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";
import { FilePicker, MediaList, uploadFiles, type Attachment } from "./media";
import { api, errorText, UserName, Avatar, readAvatar } from "./shared";
export type Channel = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  avatar?: string | null;
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
export function Channels({
  user,
  initialSelection,
  onBack,
  onChoose,
}: {
  user: User;
  initialSelection: string;
  onBack: () => void;
  onChoose: (id: string) => void;
}) {
  const [channels, setChannels] = useState<Channel[]>([]),
    [selected, setSelected] = useState<string | null>(
      initialSelection === "new" ? null : initialSelection,
    ),
    [channel, setChannel] = useState<Channel | null>(null),
    [posts, setPosts] = useState<Entry[]>([]),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [body, setBody] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [creating, setCreating] = useState(initialSelection === "new"),
    [avatar, setAvatar] = useState<string | null>(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  const postRequest = useRef<string | null>(null);
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
            <h2>Новый канал</h2><button className="secondary" onClick={onBack}>← Сообщения</button>
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
                    avatar,
                  });
                  setCreating(false);
                  setTitle("");
                  setDescription("");
                  await loadList();
                  setSelected(c.id);
                  onChoose(c.id);
                });
              }}
            >
              <Avatar
                user={{ name: title || "Канал", avatar, color: "#d8efac" }}
                size={64}
              />
              <label>
                Аватар канала
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      try {
                        setAvatar(await readAvatar(f));
                      } catch (e) {
                        setError(errorText(e));
                      }
                  }}
                />
              </label>
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
        </>
      ) : (
        <>
          <button
            className="secondary"
            onClick={() => {
              setSelected(null);
              onBack();
              loadList().catch((e) => setError(errorText(e)));
            }}
          >
            ← Сообщения
          </button>
          {channel ? (
            <>
              <header className="channel-heading">
                <div className="channel-toolbar">
                  <Avatar
                    user={{
                      name: channel.title,
                      avatar: channel.avatar || null,
                      color: "#d8efac",
                    }}
                  />
                  <h2>{channel.title}</h2>
                </div>
                {channel.owner_id === user.id && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditing(!editing);
                      setTitle(channel.title);
                      setDescription(channel.description);
                      setAvatar(channel.avatar || null);
                    }}
                  >
                    Изменить канал
                  </button>
                )}
                {editing && (
                  <form
                    className="settings-card"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(async () => {
                        await api("channels/" + channel.id, "PATCH", {
                          title,
                          description,
                          avatar,
                        });
                        setEditing(false);
                        await load(channel.id);
                        onChoose(channel.id);
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
                    <Avatar
                      user={{ name: title, avatar, color: "#d8efac" }}
                      size={64}
                    />
                    <label>
                      Аватар канала
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            try {
                              setAvatar(await readAvatar(f));
                            } catch (e) {
                              setError(errorText(e));
                            }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setAvatar(null)}
                    >
                      Убрать аватар
                    </button>
                    <button className="primary" disabled={busy}>
                      Сохранить канал
                    </button>
                  </form>
                )}
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
                      if (!postRequest.current)
                        postRequest.current = crypto.randomUUID();
                      const attachments = await uploadFiles(files);
                      await api("channels/" + channel.id + "/posts", "POST", {
                        attachmentIds: attachments.map((f) => f.id),
                        body,
                        requestId: postRequest.current,
                      });
                      setBody("");
                      setFiles([]);
                      postRequest.current = null;
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

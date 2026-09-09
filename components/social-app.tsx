"use client";
import { PopularHashtags } from "./popular-hashtags";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Hash,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Users,
  X,
  Camera,
} from "lucide-react";
import type { User, Post, Comment, Chat, Message } from "@/lib/types";
import {
  api,
  Avatar,
  Logo,
  VerifiedBadge,
  errorText,
  readAvatar,
  time,
} from "./shared";
import {
  ThemeToggle,
  Notifications,
  KeyBackup,
  registerDevice,
} from "./preferences";
import { FilePicker, uploadFiles, MediaList } from "./media";
import { EncryptedMessage } from "./encrypted-message";
import { ChatKeys } from "./chat-keys";
import {
  encryptMessage,
  fingerprint,
  type PublicDevice,
} from "@/lib/crypto-chat";
type Tab = "feed" | "chats" | "people" | "profile";
export function SocialApp({ initialUser }: { initialUser: User }) {
  const [user, setUser] = useState(initialUser),
    [tab, setTab] = useState<Tab>("feed"),
    [error, setError] = useState(""),
    [chatId, setChatId] = useState<string | null>(null);
  const [people, setPeople] = useState<User[]>([]),
    [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api<User[]>(`users?q=${encodeURIComponent(query)}`)
        .then((v) => {
          if (active) setPeople(v);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  async function startChat(person: User) {
    try {
      const chat = await api<{ id: string }>("chats", "POST", {
        userIds: [person.id],
        isGroup: false,
      });
      setChatId(chat.id);
      setTab("chats");
    } catch (e) {
      setError(errorText(e));
    }
  }
  const nav = [
    { key: "feed" as const, label: "Лента", icon: Home },
    { key: "chats" as const, label: "Сообщения", icon: MessageCircle },
    { key: "people" as const, label: "Люди", icon: Users },
    { key: "profile" as const, label: "Мой профиль", icon: Settings },
  ];
  return (
    <div className="app-shell">
      <Notifications
        userId={user.id}
        onOpen={(id) => {
          setChatId(id);
          setTab("chats");
        }}
      />
      <aside className="sidebar">
        <Logo />
        <nav>
          {nav.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${tab === item.key ? "active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              <item.icon size={21} />
              <span>{item.label}</span>
              {tab === item.key && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <button
          className="primary write-button"
          onClick={() => {
            setTab("feed");
            setTimeout(() => document.getElementById("post-body")?.focus(), 50);
          }}
        >
          <Plus size={20} />
          <span>Написать пост</span>
        </button>
        <div className="sidebar-bottom">
          <ThemeToggle />
          <button className="user-switch" onClick={() => setTab("profile")}>
            <Avatar user={user} size={38} />
            <span>
              <strong>
                {user.name}
                <VerifiedBadge userId={user.id} />
              </strong>
              <small>Мой профиль</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            className="logout"
            onClick={async () => {
              try {
                await api("auth/logout", "POST", {});
                window.location.assign("/register");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <LogOut size={15} />
            <span>Выйти из аккаунта</span>
          </button>
        </div>
      </aside>
      <main className={`main-content ${tab === "chats" ? "chat-main" : ""}`}>
        <div className="mobile-brand">
          <Logo />
          <ThemeToggle />
        </div>
        {error && (
          <div className="error global-error" role="alert">
            {error}
            <button
              className="icon-button"
              onClick={() => setError("")}
              aria-label="Закрыть ошибку"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {tab === "feed" && <Feed user={user} onPerson={startChat} />}
        {tab === "chats" && (
          <Chats user={user} initialChatId={chatId} onSelected={setChatId} />
        )}
        {tab === "people" && (
          <>
            <Header title="Люди" />
            <div className="section-pad">
              <label className="search-field">
                <Search size={18} />
                <input
                  placeholder="Найти по имени"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="people-list">
                {people.map((person) => (
                  <Person
                    key={person.id}
                    person={person}
                    onChat={() => startChat(person)}
                  />
                ))}
                {!people.length && (
                  <Empty
                    icon={<Users size={30} />}
                    title="Пока никого не нашли"
                    text="Пригласи друзей или попробуй другое имя."
                  />
                )}
              </div>
            </div>
          </>
        )}
        {tab === "profile" && <Profile user={user} onSaved={setUser} />}
      </main>
      {tab !== "chats" && (
        <aside className="rightbar">
          <PopularHashtags />
          <div className="right-title">
            <h3>Новые лица</h3>
            <Users size={17} />
          </div>
          {people.slice(0, 4).map((person) => (
            <button
              className="suggested"
              key={person.id}
              onClick={() => startChat(person)}
            >
              <Avatar user={person} size={38} />
              <span>
                <strong>
                  {person.name}
                  <VerifiedBadge userId={person.id} />
                </strong>
                <small>{person.bio || "Уже в TELEJKA"}</small>
              </span>
              <Plus size={16} />
            </button>
          ))}
          {!people.length && (
            <p className="muted small">Пользователей пока нет.</p>
          )}
          <button
            className="text-button discover"
            onClick={() => setTab("people")}
          >
            Найти людей <ArrowRightIcon />
          </button>
        </aside>
      )}
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={15} />;
}
function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Person({ person, onChat }: { person: User; onChat: () => void }) {
  return (
    <div className="person">
      <Avatar user={person} />
      <div>
        <strong>
          {person.name}
          <VerifiedBadge userId={person.id} />
        </strong>
        <p>{person.bio || ""}</p>
      </div>
      <button className="secondary" onClick={onChat}>
        <MessageCircle size={16} />
        <span>Написать</span>
      </button>
    </div>
  );
}
function Feed({
  user,
  onPerson,
  mine = false,
}: {
  user: User;
  onPerson: (u: User) => void;
  mine?: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [posts, setPosts] = useState<Post[]>([]),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [filter, setFilter] = useState(mine);
  async function refresh(offset = 0) {
    try {
      const data = await api<Post[]>(`posts?offset=${offset}&mine=${filter}`);
      setPosts((v) => (offset ? [...v, ...data] : data));
      setMore(data.length === 20);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Post[]>(`posts?mine=${filter}`)
      .then((data) => {
        if (active) {
          setPosts(data);
          setMore(data.length === 20);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter]);
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const attachments = await uploadFiles(files);
      await api("posts", "POST", {
        body,
        attachmentIds: attachments.map((a) => a.id),
      });
      setFiles([]);
      setBody("");
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!mine && <Header title="Лента" />}
      {!mine && (
        <div className="feed-tabs">
          <button
            className={!filter ? "selected" : ""}
            onClick={() => setFilter(false)}
          >
            Все посты
          </button>
          <button
            className={filter ? "selected" : ""}
            onClick={() => setFilter(true)}
          >
            Мои посты
          </button>
          <button
            className="refresh-feed"
            onClick={() => refresh()}
            aria-label="Обновить ленту"
          >
            Обновить ↻
          </button>
        </div>
      )}
      {!mine && (
        <form className="composer" onSubmit={publish}>
          <Avatar user={user} />
          <div className="composer-inner">
            <textarea
              id="post-body"
              placeholder={`Что у тебя нового, ${user.name}?`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <FilePicker files={files} onChange={setFiles} disabled={busy} />
            <div className="composer-bottom">
              <span>
                <span className="live-dot" /> Видно всем
                {body.length > 0 && ` · ${body.length}/2000`}
              </span>
              <button
                className="primary"
                disabled={busy || (!body.trim() && !files.length)}
              >
                {busy ? "Публикуем…" : "Опубликовать"}
                <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="loading">Загружаем ленту…</p>
      ) : posts.length ? (
        <div>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              user={user}
              onPerson={onPerson}
              onChange={() => refresh()}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={<Sparkles size={28} />}
          title={filter ? "Постов пока нет" : "Постов пока нет"}
          text=""
        />
      )}
      {more && (
        <button
          className="load-more secondary"
          onClick={() => refresh(posts.length)}
        >
          Показать ещё <ArrowDown size={16} />
        </button>
      )}
    </>
  );
}
function PostCard({
  post,
  user,
  onPerson,
  onChange,
}: {
  post: Post;
  user: User;
  onPerson: (u: User) => void;
  onChange: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [liked, setLiked] = useState(post.liked),
    [likes, setLikes] = useState(post.likes),
    [open, setOpen] = useState(false),
    [comments, setComments] = useState<Comment[]>([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [liking, setLiking] = useState(false),
    [commentMore, setCommentMore] = useState(false),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    setLiked(post.liked);
    setLikes(post.likes);
  }, [post.liked, post.likes]);
  async function load(offset = 0) {
    setLoading(true);
    try {
      const data = await api<Comment[]>(
        `posts/${post.id}/comments?offset=${offset}`,
      );
      setComments((v) => (offset ? [...v, ...data] : data));
      setCommentMore(data.length === 50);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function like() {
    if (liking) return;
    setLiking(true);
    try {
      await api(`posts/${post.id}/like`, "POST", { liked: !liked });
      setLikes((v) => v + (liked ? -1 : 1));
      setLiked(!liked);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLiking(false);
    }
  }
  async function comment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const attachments = await uploadFiles(files);
      await api(`posts/${post.id}/comments`, "POST", {
        body,
        attachmentIds: attachments.map((a) => a.id),
      });
      setFiles([]);
      setBody("");
      await load();
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="post">
      <Avatar user={post.author} />
      <div className="post-content">
        <div className="post-heading">
          <button
            className="author-name"
            onClick={() => post.author.id !== user.id && onPerson(post.author)}
          >
            {post.author.name}
            <VerifiedBadge userId={post.author.id} />
          </button>
          {post.author.id === user.id && <span className="you-tag">ты</span>}
          <time dateTime={post.created_at}>{time(post.created_at)}</time>
          {post.author.id === user.id && (
            <button
              className="icon-button delete-post"
              aria-label="Удалить пост"
              onClick={async () => {
                if (!confirm("Удалить этот пост и комментарии к нему?")) return;
                try {
                  await api(`posts/${post.id}`, "DELETE");
                  onChange();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <p className="post-body">{post.body}</p>
        <MediaList items={post.attachments} />
        <div className="post-actions">
          <button
            className={liked ? "is-liked" : ""}
            disabled={liking}
            onClick={like}
            aria-label={liked ? "Убрать лайк" : "Поставить лайк"}
          >
            <Heart size={18} fill={liked ? "currentColor" : "none"} />
            {likes || ""}
          </button>
          <button
            onClick={() => {
              if (!open) load();
              setOpen(!open);
            }}
          >
            <MessageCircle size={18} />
            {post.comments || ""}
            <span>Обсудить</span>
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {open && (
          <div className="comments">
            {comments.map((c) => (
              <div className="comment" key={c.id}>
                <Avatar user={c.author} size={30} />
                <div>
                  <strong>
                    {c.author.name}
                    <VerifiedBadge userId={c.author.id} />
                  </strong>
                  <p>{c.body}</p>
                  <MediaList items={c.attachments} />
                  <small>{time(c.created_at)}</small>
                </div>
              </div>
            ))}
            {loading && <p className="muted small">Загружаем комментарии…</p>}
            {commentMore && (
              <button
                className="text-button"
                onClick={() => load(comments.length)}
              >
                Ещё комментарии
              </button>
            )}
            <FilePicker files={files} onChange={setFiles} disabled={busy} />
            <form onSubmit={comment} className="comment-form">
              <input
                aria-label="Комментарий"
                placeholder="Добавить к разговору…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={1000}
              />
              <button
                className="icon-button"
                disabled={busy || (!body.trim() && !files.length)}
                aria-label="Отправить комментарий"
              >
                <Send size={17} />
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
function Profile({
  user,
  onSaved,
}: {
  user: User;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user.name),
    [bio, setBio] = useState(user.bio),
    [avatar, setAvatar] = useState(user.avatar),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      onSaved(await api<User>("me", "PATCH", { name, bio, avatar }));
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        title="Твой профиль"
        action={
          <button
            className="secondary"
            onClick={async () => {
              try {
                await api("auth/logout", "POST", {});
                window.location.assign("/register");
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        }
      />
      <div className="profile-cover" />
      <form className="profile-form" onSubmit={save}>
        <div className="profile-avatar">
          <label className="upload-avatar">
            <Avatar user={{ name, avatar, color: user.color }} size={86} />
            <span className="camera-badge">
              <Camera size={15} />
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Изменить аватар"
              onChange={async (e) => {
                try {
                  if (e.target.files?.[0])
                    setAvatar(await readAvatar(e.target.files[0]));
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            />
          </label>
          {avatar && (
            <button
              type="button"
              className="text-button"
              onClick={() => setAvatar(null)}
            >
              Убрать фото
            </button>
          )}
        </div>
        <label className="field-label">
          Имя пользователя
          <input
            value={name}
            required
            minLength={2}
            maxLength={32}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p className="muted small">
          Используется для входа. После изменения входи под новым именем.
        </p>
        <label className="field-label">
          О себе
          <textarea
            value={bio}
            maxLength={240}
            rows={3}
            onChange={(e) => {
              setBio(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {saved ? (
            <>
              <Check size={17} /> Сохранено
            </>
          ) : busy ? (
            "Сохраняем…"
          ) : (
            "Сохранить изменения"
          )}
        </button>
      </form>
      <KeyBackup userId={user.id} />
      <h3 className="profile-posts-title">Твои публикации</h3>
      <Feed user={user} onPerson={() => {}} mine />
    </>
  );
}
function chatName(chat: Chat, userId: string) {
  return chat.is_group
    ? chat.title || "Группа"
    : chat.participants.find((p) => p.id !== userId)?.name || "Личный чат";
}
function Chats({
  user,
  initialChatId,
  onSelected,
}: {
  user: User;
  initialChatId: string | null;
  onSelected: (id: string | null) => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]),
    [selected, setSelected] = useState<string | null>(initialChatId),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api<Chat[]>("chats")
        .then((v) => {
          if (active) {
            setChats(v);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const current = chats.find((c) => c.id === selected);
  return (
    <>
      <Header
        title="Сообщения"
        action={
          <button className="secondary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            <span>Новый чат</span>
          </button>
        }
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className={`messenger ${selected ? "has-selected" : ""}`}>
        <section className="chat-list">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Поиск чатов"
              placeholder="Найти разговор"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {chats
            .filter((c) =>
              chatName(c, user.id).toLowerCase().includes(search.toLowerCase()),
            )
            .map((chat) => (
              <button
                className={`chat-item ${selected === chat.id ? "selected" : ""}`}
                key={chat.id}
                onClick={() => {
                  setSelected(chat.id);
                  onSelected(chat.id);
                }}
              >
                {chat.is_group ? (
                  <span className="group-avatar">
                    <Users size={22} />
                  </span>
                ) : (
                  <Avatar
                    user={
                      chat.participants.find((p) => p.id !== user.id) || user
                    }
                  />
                )}
                <span>
                  <strong>
                    {chatName(chat, user.id)}
                    {!chat.is_group && (
                      <VerifiedBadge
                        userId={
                          chat.participants.find((p) => p.id !== user.id)?.id
                        }
                      />
                    )}
                  </strong>
                  <small>{chat.last_body || "Нет сообщений"}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          {!chats.length && (
            <Empty
              icon={<MessageCircle size={25} />}
              title="Нет чатов"
              text="Создай личный чат или собери друзей в группу."
            />
          )}
        </section>
        <section className="chat-window">
          {current ? (
            <Conversation
              key={current.id}
              chat={current}
              user={user}
              onBack={() => {
                setSelected(null);
                onSelected(null);
              }}
            />
          ) : (
            <Empty
              icon={<MessageCircle size={38} />}
              title={selected ? "Открываем разговор…" : "Выберите чат"}
              text="Выбери чат слева или напиши кому-то первым."
            />
          )}
        </section>
      </div>
      {creating && (
        <NewChat
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            setSelected(id);
            onSelected(id);
            try {
              setChats(await api<Chat[]>("chats"));
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
      )}
    </>
  );
}
function Conversation({
  chat,
  user,
  onBack,
}: {
  chat: Chat;
  user: User;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [keyWarning, setKeyWarning] = useState<{
      value: string;
      prints: string[];
    } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [showMembers, setShowMembers] = useState(false);
  const scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    first = useRef(true);
  function merge(incoming: Message[]) {
    setMessages((old) => {
      const map = new Map(old.map((m) => [m.id, m]));
      incoming.forEach((m) => map.set(m.id, m));
      return [...map.values()].sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      );
    });
  }
  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      api<Message[]>(`chats/${chat.id}/messages`)
        .then((data) => {
          if (active) {
            merge(data);
            if (first.current) {
              setMore(data.length === 100);
              first.current = false;
            }
            setError("");
            setLoading(false);
          }
        })
        .catch((e) => {
          if (active) {
            setError(errorText(e));
            setLoading(false);
          }
        });
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [chat.id]);
  useEffect(() => {
    if (nearBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || (!body.trim() && !files.length)) return;
    setBusy(true);
    try {
      await registerDevice(user.id);
      const devices = await api<PublicDevice[]>(`chats/${chat.id}/keys`);
      if (
        chat.participants.some((p) => !devices.some((d) => d.user_id === p.id))
      )
        throw Error(
          "Все участники должны открыть обновлённую TELEJKA для создания ключей шифрования.",
        );
      const prints = await Promise.all(
        devices.map(
          async (d) =>
            `${chat.participants.find((p) => p.id === d.user_id)?.name ?? "Участник"}: ${await fingerprint(d.public_key)}`,
        ),
      );
      const value = devices
        .map((d) => d.id + ":" + d.public_key.n)
        .sort()
        .join("|");
      const pin = "telejka-peers:" + user.id + ":" + chat.id;
      const previous = localStorage.getItem(pin);
      if (previous && previous !== value) {
        setKeyWarning({ value, prints });
        throw Error(
          "Устройства участников изменились. Проверьте ключи перед отправкой.",
        );
      }
      if (!previous) localStorage.setItem(pin, value);
      const attachments = await uploadFiles(files, chat.id);
      const envelope = await encryptMessage(
        chat.id,
        { body, attachments },
        devices,
      );
      await api(`chats/${chat.id}/messages`, "POST", {
        envelope,
        clientId: crypto.randomUUID(),
        attachmentIds: attachments.map((a) => a.id),
      });
      setFiles([]);
      setBody("");
      nearBottom.current = true;
      merge(await api<Message[]>(`chats/${chat.id}/messages`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    try {
      const data = await api<Message[]>(
        `chats/${chat.id}/messages?before=${encodeURIComponent(messages[0].created_at)}`,
      );
      const el = scroll.current;
      const height = el?.scrollHeight || 0;
      nearBottom.current = false;
      merge(data);
      setMore(data.length === 100);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - height;
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <div className="conversation-heading">
        <button
          className="icon-button back-chat"
          onClick={onBack}
          aria-label="К списку чатов"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <strong>
            {chatName(chat, user.id)}
            {!chat.is_group && (
              <VerifiedBadge
                userId={chat.participants.find((p) => p.id !== user.id)?.id}
              />
            )}
          </strong>
          <small>
            {chat.is_group
              ? `${chat.participants.length} участников`
              : "Личный разговор"}
          </small>
        </div>
        <button
          className="icon-button"
          aria-label="Участники чата"
          onClick={() => setShowMembers(!showMembers)}
        >
          <Users size={19} />
        </button>
      </div>
      {showMembers && (
        <div className="members-panel">
          <ChatKeys chat={chat} />
          {chat.participants.map((p) => (
            <div key={p.id}>
              <Avatar user={p} size={25} />
              {p.name}
              <VerifiedBadge userId={p.id} />
              {p.id === user.id && " (ты)"}
            </div>
          ))}
        </div>
      )}
      <div
        className="messages"
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el)
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        {more && (
          <button className="text-button older" onClick={older}>
            Предыдущие сообщения
          </button>
        )}
        {loading && <p className="loading">Загружаем сообщения…</p>}
        {!loading && !messages.length && (
          <Empty icon={<Send size={27} />} title="Нет сообщений" text="" />
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message ${m.user_id === user.id ? "own" : ""}`}
          >
            {chat.is_group && m.user_id !== user.id && (
              <strong>
                {m.author.name}
                <VerifiedBadge userId={m.author.id} />
              </strong>
            )}
            <EncryptedMessage message={m} chatId={chat.id} userId={user.id} />
            <time title={time(m.created_at)}>
              {new Intl.DateTimeFormat("ru", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(m.created_at))}
            </time>
          </div>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {keyWarning && (
        <div className="security-panel">
          <strong>Изменились ключи участников</strong>
          <p>
            Сравните эти отпечатки с ключами в профилях собеседников по другому
            каналу связи.
          </p>
          {keyWarning.prints.map((p) => (
            <code key={p}>{p}</code>
          ))}
          <button
            className="secondary"
            onClick={() => {
              localStorage.setItem(
                "telejka-peers:" + user.id + ":" + chat.id,
                keyWarning.value,
              );
              setKeyWarning(null);
              setError("");
            }}
          >
            Подтвердить ключи
          </button>
        </div>
      )}
      <div className="chat-files">
        <FilePicker files={files} onChange={setFiles} disabled={busy} chat />
      </div>
      <form className="message-form" onSubmit={send}>
        <textarea
          placeholder="Напиши что-нибудь…"
          aria-label="Сообщение"
          rows={1}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="primary"
          aria-label="Отправить сообщение"
          disabled={busy || (!body.trim() && !files.length)}
        >
          <Send size={19} />
        </button>
      </form>
    </>
  );
}
function NewChat({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [group, setGroup] = useState(false),
    [title, setTitle] = useState(""),
    [query, setQuery] = useState(""),
    [people, setPeople] = useState<User[]>([]),
    [selected, setSelected] = useState<User[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    const t = setTimeout(
      () =>
        api<User[]>(`users?q=${encodeURIComponent(query)}`)
          .then((v) => {
            if (active) setPeople(v);
          })
          .catch((e) => {
            if (active) setError(errorText(e));
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const chat = await api<{ id: string }>("chats", "POST", {
        isGroup: group,
        title,
        userIds: selected.map((p) => p.id),
      });
      onCreated(chat.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      aria-labelledby="new-chat-title"
    >
      <div className="modal-heading">
        <h2 id="new-chat-title">Новый разговор</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>
      <div className="segmented">
        <button
          className={!group ? "selected" : ""}
          onClick={() => {
            setGroup(false);
            setSelected([]);
          }}
        >
          Личный чат
        </button>
        <button
          className={group ? "selected" : ""}
          onClick={() => {
            setGroup(true);
            setSelected([]);
          }}
        >
          Группа
        </button>
      </div>
      <form onSubmit={create}>
        {group && (
          <label className="field-label">
            Название группы
            <input
              placeholder="Как назовём вашу компанию?"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        )}
        <label className="search-field">
          <Search size={17} />
          <input
            autoFocus
            placeholder="Найти людей по имени"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {selected.length > 0 && (
          <div className="selected-people">
            {selected.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() =>
                  setSelected((v) => v.filter((x) => x.id !== p.id))
                }
              >
                {p.name}
                <X size={12} />
              </button>
            ))}
          </div>
        )}
        <div className="select-people">
          {people.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() =>
                setSelected((v) =>
                  v.some((x) => x.id === p.id)
                    ? v.filter((x) => x.id !== p.id)
                    : group
                      ? [...v, p].slice(0, 49)
                      : [p],
                )
              }
            >
              <Avatar user={p} size={36} />
              <strong>
                {p.name}
                <VerifiedBadge userId={p.id} />
              </strong>
              <span
                className={`checkbox ${selected.some((x) => x.id === p.id) ? "checked" : ""}`}
              >
                {selected.some((x) => x.id === p.id) && <Check size={14} />}
              </span>
            </button>
          ))}
          {!people.length && (
            <p className="muted">
              Пользователей пока нет. Пригласи друзей в TELEJKA.
            </p>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary auth-submit"
          disabled={busy || !selected.length}
        >
          {busy
            ? "Создаём…"
            : group
              ? `Создать группу · ${selected.length + 1}`
              : "Начать разговор"}
          <ArrowUpRight size={17} />
        </button>
      </form>
    </dialog>
  );
}

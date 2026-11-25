"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Music2,
  Home,
  Heart,
  Library,
  UserRound,
  Search,
  Play,
  Plus,
  Share2,
  SkipBack,
  SkipForward,
  LogOut,
} from "lucide-react";
import { api, Avatar, errorText } from "./shared";
import { uploadFiles, loadAttachment, type Attachment } from "./media";
import { TelejkaPlayer } from "./telejka-player";
import type { User } from "@/lib/types";
type Track = {
  id: string;
  title: string;
  release_id: string;
  release_title: string;
  author: User;
  file: Attachment;
  cover: Attachment;
  liked: boolean;
};
type Playlist = { id: string; title: string };
function useFile(file?: Attachment) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true,
      url = "";
    setUrl("");
    if (file)
      void loadAttachment(file)
        .then((b) => {
          if (live) {
            url = URL.createObjectURL(b);
            setUrl(url);
          }
        })
        .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file?.id]);
  return url;
}
function Cover({ file }: { file: Attachment }) {
  const url = useFile(file);
  return (
    <div className="music-cover">
      {url ? <img src={url} alt="Обложка релиза" /> : <Music2 />}
    </div>
  );
}
export function TelejkaMusic() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [tracks, setTracks] = useState<Track[]>([]),
    [lists, setLists] = useState<Playlist[]>([]),
    [section, setSection] = useState("home"),
    [artist, setArtist] = useState<User | null>(null),
    [release, setRelease] = useState(""),
    [playlist, setPlaylist] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [current, setCurrent] = useState<Track | null>(null),
    [queue, setQueue] = useState<Track[]>([]),
    [upload, setUpload] = useState(false),
    [addTo, setAddTo] = useState<Track | null>(null),
    [loading, setLoading] = useState(false),
    [newList, setNewList] = useState("");
  const generation = useRef(0);
  const url = useFile(current?.file);
  async function session() {
    try {
      setUser(await api<User>("me"));
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void session();
  }, []);
  async function load() {
    const gen = ++generation.current;
    setLoading(true);
    try {
      let rows = await api<Track[]>(
        "music/tracks?q=" +
          encodeURIComponent(search) +
          (section === "liked" ? "&liked=true" : "") +
          (artist
            ? "&author=" + artist.id
            : section === "profile"
              ? "&author=" + user!.id
              : ""),
      );
      if (playlist) {
        const ids = await api<{ track_id: string }[]>(
          "music/playlists/" + playlist,
        );
        const loaded = new Map(rows.map((t) => [t.id, t]));
        const missing = await Promise.all(
          ids
            .filter((x) => !loaded.has(x.track_id))
            .map((x) => api<Track[]>("music/tracks/" + x.track_id)),
        );
        missing.flat().forEach((t) => loaded.set(t.id, t));
        rows = ids.flatMap((x) =>
          loaded.has(x.track_id) ? [loaded.get(x.track_id)!] : [],
        );
      }
      if (gen === generation.current) setTracks(rows);
    } catch (e) {
      if (gen === generation.current) setError(errorText(e));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (user) {
      void load();
      void api<Playlist[]>("music/playlists")
        .then(setLists)
        .catch((e) => setError(errorText(e)));
    }
  }, [user?.id, section, artist?.id, playlist, search]);
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(location.search).get("track");
    if (id)
      void api<Track[]>("music/tracks/" + encodeURIComponent(id))
        .then((rows) => {
          if (rows[0]) {
            setCurrent(rows[0]);
            setQueue(rows);
          } else setError("Песня недоступна.");
        })
        .catch((e) => setError(errorText(e)));
  }, [user?.id]);
  function navigate(s: string) {
    setSection(s);
    setArtist(null);
    setRelease("");
    setPlaylist("");
    setSearch("");
    setQuery("");
    setUpload(false);
  }
  const visible = release
    ? tracks.filter((t) => t.release_id === release)
    : tracks;
  function play(t: Track) {
    setCurrent(t);
    setQueue(visible);
    history.replaceState(null, "", "/music?track=" + t.id);
  }
  function step(n: number) {
    const i = queue.findIndex((t) => t.id === current?.id);
    const next = queue[i + n];
    if (next) {
      setCurrent(next);
      history.replaceState(null, "", "/music?track=" + next.id);
    }
  }
  if (checking)
    return (
      <main className="music-app music-auth">Загружаем Telejka MUSIC…</main>
    );
  if (!user) return <MusicAuth onLogin={session} />;
  const albums = [...new Map(tracks.map((t) => [t.release_id, t])).values()];
  return (
    <div className="music-app">
      <aside className="music-sidebar">
        <a className="music-brand" href="/music">
          <Music2 />
          telejka <b>MUSIC</b>
        </a>
        <nav>
          {[
            ["home", "Главная", Home],
            ["liked", "Любимые", Heart],
            ["library", "Плейлисты", Library],
            ["profile", "Мой профиль", UserRound],
          ].map(([key, label, Icon]) => {
            const I = Icon as typeof Home;
            return (
              <button
                key={key as string}
                aria-current={section === key ? "page" : undefined}
                onClick={() => navigate(key as string)}
              >
                <I size={21} />
                {label as string}
              </button>
            );
          })}
        </nav>
        <div className="music-sidebar-bottom">
          <a href="/feed" target="_blank" rel="noopener">
            Открыть TELEJKA ↗
          </a>
          <button
            onClick={async () => {
              try {
                await api("auth/logout", "POST");
                setCurrent(null);
                setUser(null);
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <LogOut size={18} />
            Выйти из MUSIC
          </button>
        </div>
      </aside>
      <main className="music-main">
        <header>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSection("home");
              setArtist(null);
              setRelease("");
              setPlaylist("");
              setSearch(query);
            }}
          >
            <Search size={20} />
            <input
              aria-label="Поиск песен и альбомов"
              placeholder="Песни и альбомы"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button>Найти</button>
          </form>
          <button onClick={() => navigate("profile")} aria-label="Мой профиль">
            <Avatar user={user} size={36} />
          </button>
        </header>
        {error && (
          <p role="alert" className="music-error">
            {error}
            <button
              onClick={() => {
                setError("");
                void load();
              }}
            >
              Повторить
            </button>
          </p>
        )}
        <div className="music-heading">
          <div>
            <small>TELEJKA MUSIC</small>
            <h1>
              {artist
                ? artist.name
                : release
                  ? visible[0]?.release_title
                  : playlist
                    ? lists.find((x) => x.id === playlist)?.title
                    : section === "profile"
                      ? user.name
                      : section === "liked"
                        ? "Любимые песни"
                        : section === "library"
                          ? "Твоя библиотека"
                          : search
                            ? "Результаты поиска"
                            : "Музыка, которая рядом"}
            </h1>
          </div>
          {section === "profile" && (
            <button
              className="music-primary"
              onClick={() => setUpload(!upload)}
            >
              <Plus />
              Загрузить релиз
            </button>
          )}
        </div>
        {artist && artist.id !== user.id && <Follow id={artist.id} />}{" "}
        {upload && (
          <ReleaseUpload
            onDone={() => {
              setUpload(false);
              void load();
            }}
          />
        )}
        {section === "library" && (
          <section className="music-library">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const list = await api<Playlist>("music/playlists", "POST", {
                    title: newList,
                  });
                  setLists((old) => [list, ...old]);
                  setNewList("");
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              <input
                required
                maxLength={100}
                placeholder="Название нового плейлиста"
                aria-label="Название плейлиста"
                value={newList}
                onChange={(e) => setNewList(e.target.value)}
              />
              <button className="music-primary">Создать</button>
            </form>
            <div className="music-playlists">
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setPlaylist(l.id);
                    setRelease("");
                  }}
                >
                  <Library />
                  {l.title}
                </button>
              ))}
            </div>
          </section>
        )}
        {!release &&
          !playlist &&
          section !== "liked" &&
          section !== "library" && (
            <div className="music-albums">
              {albums.map((t) => (
                <button
                  key={t.release_id}
                  className="music-album"
                  onClick={() => setRelease(t.release_id)}
                >
                  <Cover file={t.cover} />
                  <strong>{t.release_title}</strong>
                  <small>
                    {t.author.name} ·{" "}
                    {tracks.filter((x) => x.release_id === t.release_id)
                      .length === 1
                      ? "Сингл"
                      : "Альбом"}
                  </small>
                </button>
              ))}
            </div>
          )}
        {release && (
          <button onClick={() => setRelease("")}>← Все релизы</button>
        )}
        {(section !== "library" || playlist) && (
          <section className="music-tracks">
            <h2>
              {release
                ? "Песни альбома"
                : playlist
                  ? "Песни плейлиста"
                  : "Песни"}
            </h2>
            {loading ? (
              <p>Загрузка…</p>
            ) : !visible.length ? (
              <p>Здесь пока нет музыки.</p>
            ) : (
              visible.map((t, i) => (
                <article
                  key={t.id}
                  className={
                    "music-track" + (current?.id === t.id ? " is-playing" : "")
                  }
                >
                  <button
                    className="music-play"
                    aria-label={"Слушать " + t.title}
                    onClick={() => play(t)}
                  >
                    <Cover file={t.cover} />
                    <Play size={18} />
                  </button>
                  <div className="music-track-info">
                    <button onClick={() => play(t)}>{t.title}</button>
                    <button
                      onClick={() => {
                        setArtist(t.author);
                        setRelease("");
                        setPlaylist("");
                        setSection("home");
                      }}
                    >
                      {t.author.name}
                    </button>
                  </div>
                  <span className="music-release-name">{t.release_title}</span>
                  <button
                    aria-label={t.liked ? "Убрать лайк" : "Нравится"}
                    aria-pressed={t.liked}
                    onClick={async () => {
                      try {
                        await api(
                          "music/tracks/" + t.id + "/like",
                          t.liked ? "DELETE" : "POST",
                        );
                        setTracks((old) =>
                          old.map((x) =>
                            x.id === t.id ? { ...x, liked: !x.liked } : x,
                          ),
                        );
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    <Heart size={19} fill={t.liked ? "currentColor" : "none"} />
                  </button>
                  <button aria-label="В плейлист" onClick={() => setAddTo(t)}>
                    <Plus size={19} />
                  </button>
                  <button
                    aria-label="Скопировать ссылку на песню"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(location.origin + "/music?track=" + t.id)
                        .then(() => setError("Ссылка на песню скопирована."))
                        .catch(() => setError("Не удалось скопировать ссылку."))
                    }
                  >
                    <Share2 size={18} />
                  </button>
                  {playlist && (
                    <button
                      aria-label="Убрать из плейлиста"
                      onClick={async () => {
                        try {
                          await api(
                            "music/playlists/" + playlist + "/" + t.id,
                            "DELETE",
                          );
                          void load();
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      ×
                    </button>
                  )}
                </article>
              ))
            )}
          </section>
        )}
      </main>
      {addTo && (
        <div
          className="music-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Добавить в плейлист"
        >
          <section>
            <h2>Добавить «{addTo.title}»</h2>
            {lists.length ? (
              lists.map((l) => (
                <button
                  key={l.id}
                  onClick={async () => {
                    try {
                      await api(
                        "music/playlists/" + l.id + "/" + addTo.id,
                        "POST",
                      );
                      setAddTo(null);
                      if (playlist) void load();
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  {l.title}
                </button>
              ))
            ) : (
              <p>Сначала создайте плейлист в библиотеке.</p>
            )}
            <button onClick={() => setAddTo(null)}>Закрыть</button>
          </section>
        </div>
      )}
      {current && (
        <footer className="music-player">
          <div className="music-now">
            <Cover file={current.cover} />
            <div>
              <strong>{current.title}</strong>
              <small>{current.author.name}</small>
            </div>
          </div>
          <button
            aria-label="Предыдущая песня"
            disabled={queue.findIndex((t) => t.id === current.id) <= 0}
            onClick={() => step(-1)}
          >
            <SkipBack />
          </button>
          {url ? (
            <TelejkaPlayer
              key={current.id}
              src={url}
              audio
              autoPlay
              name={current.file.name}
              onEnded={() => step(1)}
            />
          ) : (
            <p>Загружаем песню…</p>
          )}
          <button
            aria-label="Следующая песня"
            disabled={
              queue.findIndex((t) => t.id === current.id) >= queue.length - 1
            }
            onClick={() => step(1)}
          >
            <SkipForward />
          </button>
        </footer>
      )}
    </div>
  );
}
function Follow({ id }: { id: string }) {
  const [state, setState] = useState<{
      subscribed: boolean;
      followers: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api<{ subscribed: boolean; followers: number }>("follows/" + id)
      .then(setState)
      .catch((e) => setError(errorText(e)));
  }, [id]);
  return (
    <div>
      <button
        disabled={!state}
        onClick={async () => {
          try {
            setState(
              await api("follows/" + id, state?.subscribed ? "DELETE" : "POST"),
            );
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        {state?.subscribed ? "Вы подписаны" : "Подписаться"} ·{" "}
        {state?.followers || 0}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function MusicAuth({ onLogin }: { onLogin: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(shared = false) {
    setBusy(true);
    try {
      await api(
        shared
          ? "auth/use-telejka"
          : "auth/" + (register ? "register" : "login"),
        "POST",
        shared ? undefined : { name, password, bio: "" },
      );
      await onLogin();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="music-app music-auth">
      <section>
        <Music2 size={48} />
        <h1>Telejka MUSIC</h1>
        <p>Твои песни. Твои авторы. Твоя коллекция.</p>
        <button
          className="music-primary"
          disabled={busy}
          onClick={() => void run(true)}
        >
          Продолжить с TELEJKA
        </button>
        <h2>{register ? "Создать аккаунт" : "Войти в аккаунт"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <input
            required
            aria-label="Имя"
            placeholder="Имя"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            required
            minLength={8}
            type="password"
            aria-label="Пароль"
            placeholder="Пароль"
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button disabled={busy}>
            {busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>
        <button onClick={() => setRegister(!register)}>
          {register ? "Уже есть аккаунт" : "Создать новый аккаунт"}
        </button>
        <small>Новый аккаунт также работает в TELEJKA.</small>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
function ReleaseUpload({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState(""),
    [cover, setCover] = useState<File | null>(null),
    [songs, setSongs] = useState<{ file: File; title: string }[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const trackPicker = useRef<HTMLInputElement>(null);
  const cached = useRef(new Map<File, Attachment>());
  async function upload(file: File) {
    const old = cached.current.get(file);
    if (old) return old;
    const [item] = await uploadFiles([file]);
    cached.current.set(file, item);
    return item;
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cover || !songs.length) return;
    setBusy(true);
    setError("");
    try {
      setStatus("Загружаем обложку…");
      const image = await upload(cover);
      const tracks = [];
      for (let i = 0; i < songs.length; i++) {
        setStatus("Загружаем песню " + (i + 1) + " из " + songs.length + "…");
        const audio = await upload(songs[i].file);
        tracks.push({ title: songs[i].title, uploadId: audio.id });
      }
      setStatus("Публикуем релиз…");
      await api("music/releases", "POST", { title, cover: image.id, tracks });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="music-upload" onSubmit={submit}>
      <h2>Новый релиз</h2>
      <fieldset disabled={busy}>
        <label>
          Название релиза
          <input
            required
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Обложка · JPG, PNG или WebP, до 5 МБ
          <input
            required
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.size <= 5 * 1024 * 1024) setCover(f);
              else {
                setCover(null);
                e.target.value = "";
                setError("Обложка должна быть меньше 5 МБ.");
              }
            }}
          />
        </label>
        <div>
          <p>Песни · MP3, M4A, OGG или WAV, до 25 МБ каждая</p>
          <input
            ref={trackPicker}
            hidden
            type="file"
            accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (!files.length) return;
              if (
                songs.length + files.length > 30 ||
                files.some((f) => f.size > 25 * 1024 * 1024)
              ) {
                setError(
                  "До 30 песен, каждая не больше 25 МБ. Уже добавленные песни сохранены.",
                );
                return;
              }
              setError("");
              setSongs((old) => [
                ...old,
                ...files.map((file) => ({
                  file,
                  title: file.name.replace(/\.[^.]+$/, ""),
                })),
              ]);
            }}
          />
          <button
            type="button"
            disabled={songs.length >= 30}
            onClick={() => trackPicker.current?.click()}
          >
            <Plus size={18} />
            Добавить трек
          </button>
        </div>
        {songs.map((s, i) => (
          <div key={i} className="music-upload-song">
            <label>
              {i + 1}. Название песни
              <input
                required
                maxLength={150}
                value={s.title}
                onChange={(e) =>
                  setSongs((old) =>
                    old.map((x, j) =>
                      i === j ? { ...x, title: e.target.value } : x,
                    ),
                  )
                }
              />
              <small>{s.file.name}</small>
            </label>
            <button
              type="button"
              aria-label={"Убрать трек " + (i + 1)}
              onClick={() => setSongs((old) => old.filter((_, j) => j !== i))}
            >
              Убрать
            </button>
          </div>
        ))}
        <p>
          {songs.length > 1 ? "Альбом" : "Сингл"} · Общий лимит загрузок: 100 МБ
          в день.
        </p>
        <button className="music-primary" disabled={!cover || !songs.length}>
          Опубликовать
        </button>
      </fieldset>
      {busy && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  Radio,
  Video,
  Monitor,
  Mic,
  MicOff,
  ArrowLeft,
  Send,
} from "lucide-react";
import type { User } from "@/lib/types";
import { api, Avatar, UserName, errorText } from "./shared";

type Stream = {
  id: string;
  title: string;
  host_id: string;
  author: User;
  viewers: number;
};
type Config = {
  iceServers: RTCIceServer[];
  relayConfigured: boolean;
  maxViewers: number;
};
type Session = {
  id: string;
  title: string;
  hostKey?: string;
  media?: MediaStream;
  config: Config;
};
type ChatLine = { id: string; body: string; author: User };
type Sync = {
  ended: boolean;
  viewers: number;
  peers: { id: string; offer: RTCSessionDescriptionInit | null }[];
  answer: RTCSessionDescriptionInit | null;
  messages: ChatLine[];
};
const networkMessage =
  "Не удалось соединиться напрямую. Попробуй другую Wi-Fi сеть. В некоторых мобильных и закрытых сетях для эфира нужен TURN-сервер.";
async function gather(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", changed);
      resolve();
    };
    const changed = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, 12000);
    pc.addEventListener("icegatheringstatechange", changed);
  });
}
export function Streams() {
  const [items, setItems] = useState<Stream[]>([]),
    [session, setSession] = useState<Session | null>(null),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const pending = useRef(false),
    alive = useRef(true),
    capture = useRef<MediaStream | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      capture.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (session) return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        if (!document.hidden) {
          const data = await api<Stream[]>("streams");
          if (live) {
            setItems(data);
            setError("");
          }
        }
      } catch (e) {
        if (live) setError(errorText(e));
      } finally {
        if (live) {
          setLoading(false);
          timer = setTimeout(refresh, 15000);
        }
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [session]);
  async function start(screen: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    let media: MediaStream | null = null;
    let created: string | undefined;
    const hostKey = crypto.randomUUID();
    try {
      if (!navigator.mediaDevices || !window.RTCPeerConnection)
        throw new Error(
          "Этот браузер не поддерживает эфиры. Открой TELEJKA в современном браузере по HTTPS.",
        );
      // Capture is called directly from the user gesture (required by screen sharing).
      media = screen
        ? await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1280, height: 720, frameRate: 24 },
            audio: false,
          })
        : await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 960 },
              height: { ideal: 540 },
              frameRate: { ideal: 24, max: 30 },
              facingMode: "user",
            },
            audio: true,
          });
      capture.current = media;
      if (screen) {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getTracks().forEach((t) => media!.addTrack(t));
      }
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const config = await api<Config>("streams/config");
      if (!media.getVideoTracks().some((t) => t.readyState === "live"))
        throw new Error("Показ экрана или камера остановлены.");
      const id = crypto.randomUUID();
      await api("streams", "POST", {
        id,
        hostKey,
        title: title.trim() || "Прямой эфир",
      });
      created = id;
      if (!alive.current) {
        await api(`streams/${id}/end`, "POST", { hostKey });
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      setSession({
        id,
        hostKey,
        title: title.trim() || "Прямой эфир",
        media,
        config,
      });
    } catch (e) {
      media?.getTracks().forEach((t) => t.stop());
      if (created)
        void api(`streams/${created}/end`, "POST", { hostKey }).catch(() => {});
      if (alive.current) setError(errorText(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function watch(stream: Stream) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const config = await api<Config>("streams/config");
      if (alive.current)
        setSession({ id: stream.id, title: stream.title, config });
    } catch (e) {
      setError(errorText(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (session)
    return (
      <StreamRoom
        key={session.id + (session.hostKey || "watch")}
        session={session}
        onClose={() => {
          setSession(null);
          capture.current = null;
        }}
      />
    );
  return (
    <section className="streams-page">
      <header className="page-header">
        <h1>
          Стримы<span className="heading-dot">.</span>
        </h1>
        <Radio />
      </header>
      <div className="section-pad">
        <section className="stream-create">
          <h2>Начать прямой эфир</h2>
          <label>
            Название
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="О чём твой эфир?"
            />
          </label>
          <div className="stream-controls">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void start(false)}
            >
              <Video size={18} /> Камера и микрофон
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void start(true)}
            >
              <Monitor size={18} /> Экран и микрофон
            </button>
          </div>
          <p className="muted small">
            До 8 зрителей. Оставляй вкладку эфира открытой. Показ экрана
            доступен не во всех мобильных браузерах. Прямое подключение может не
            работать в некоторых сетях.
          </p>
        </section>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <h2>Сейчас в эфире</h2>
        {loading && <p role="status">Загружаем эфиры…</p>}
        {!loading && !items.length && (
          <p className="muted">Сейчас эфиров нет. Начни первый!</p>
        )}
        <div className="stream-grid">
          {items.map((s) => (
            <button
              key={s.id}
              className="stream-card"
              disabled={busy}
              onClick={() => void watch(s)}
            >
              <span className="stream-live">
                <Radio size={16} /> В ЭФИРЕ
              </span>
              <strong>{s.title}</strong>
              <span className="stream-author">
                <Avatar user={s.author} size={32} />
                <UserName user={s.author} />
              </span>
              <small>{s.viewers} / 8 зрителей</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function StreamRoom({
  session: s,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const hosting = !!s.hostKey,
    video = useRef<HTMLVideoElement>(null),
    cursor = useRef("0"),
    peerId = useRef(crypto.randomUUID()),
    teardown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [lines, setLines] = useState<ChatLine[]>([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [networkError, setNetworkError] = useState(""),
    [status, setStatus] = useState(hosting ? "Эфир запущен" : "Подключаемся…"),
    [viewers, setViewers] = useState(0),
    [ended, setEnded] = useState(false),
    [joined, setJoined] = useState(hosting),
    [muted, setMuted] = useState(false),
    [sending, setSending] = useState(false),
    [playBlocked, setPlayBlocked] = useState(false);
  const sendingRef = useRef(false),
    chat = useRef<HTMLDivElement>(null),
    stick = useRef(true);
  useEffect(() => {
    if (stick.current && chat.current)
      chat.current.scrollTop = chat.current.scrollHeight;
  }, [lines]);
  useEffect(() => {
    clearTimeout(teardown.current);
    let cancelled = false,
      joinedServer = false,
      ack = false,
      timer: ReturnType<typeof setTimeout>,
      connectionTimer: ReturnType<typeof setTimeout>;
    const peers = new Map<
      string,
      { pc: RTCPeerConnection; answer?: RTCSessionDescriptionInit }
    >();
    let viewer: RTCPeerConnection | undefined;
    const remote = new MediaStream();
    function show(media: MediaStream) {
      if (video.current) {
        video.current.srcObject = media;
        void video.current.play().catch(() => {
          if (!cancelled) setPlayBlocked(true);
        });
      }
    }
    function stopLocal() {
      viewer?.close();
      peers.forEach((p) => p.pc.close());
      peers.clear();
      s.media?.getTracks().forEach((t) => t.stop());
      if (video.current) video.current.srcObject = null;
    }
    function finish() {
      setEnded(true);
      setViewers(0);
      setStatus("Эфир завершён");
      stopLocal();
    }
    async function answer(id: string, offer: RTCSessionDescriptionInit) {
      const pc = new RTCPeerConnection({ iceServers: s.config.iceServers });
      const entry = {
        pc,
        answer: undefined as RTCSessionDescriptionInit | undefined,
      };
      peers.set(id, entry);
      try {
        s.media!.getTracks().forEach((t) => pc.addTrack(t, s.media!));
        await pc.setRemoteDescription(offer);
        await pc.setLocalDescription(await pc.createAnswer());
        await gather(pc);
        if (cancelled || pc.signalingState === "closed") return;
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === "video") {
            const params = sender.getParameters();
            if (params.encodings?.length) {
              params.encodings[0].maxBitrate = 700000;
              await sender.setParameters(params).catch(() => {});
            }
          }
        }
        entry.answer = pc.localDescription!.toJSON();
      } catch {
        pc.close();
        if (!cancelled)
          setError(
            "Одного из зрителей не удалось подключить. Он может выйти и подключиться снова.",
          );
      }
    }
    async function poll() {
      if (cancelled) return;
      try {
        const answers = [...peers]
          .filter(([, p]) => p.answer)
          .map(([id, p]) => ({ peerId: id, answer: p.answer! }));
        const state = await api<Sync>(`streams/${s.id}/sync`, "POST", {
          ...(hosting
            ? { hostKey: s.hostKey, answers }
            : {
                peerId: peerId.current,
                ack,
                ready: viewer?.connectionState === "connected",
              }),
          after: cursor.current,
        });
        if (cancelled) return;
        if (state.ended) {
          finish();
          return;
        }
        setViewers(state.viewers);
        if (state.messages.length) {
          cursor.current = state.messages[state.messages.length - 1].id;
          setLines((v) =>
            [
              ...v,
              ...state.messages.filter(
                (m) => !v.some((old) => old.id === m.id),
              ),
            ].slice(-200),
          );
        }
        if (hosting) {
          for (const a of answers) {
            const p = peers.get(a.peerId);
            if (p) p.answer = undefined;
          }
          const ids = new Set(state.peers.map((p) => p.id));
          for (const [id, p] of peers)
            if (!ids.has(id)) {
              p.pc.close();
              peers.delete(id);
            }
          for (const p of state.peers)
            if (p.offer && !peers.has(p.id)) void answer(p.id, p.offer);
        } else if (state.answer && !ack && viewer) {
          await viewer.setRemoteDescription(state.answer);
          ack = true;
        }
        setError("");
        timer = setTimeout(poll, 4000);
      } catch (e) {
        if (!cancelled) {
          setError(errorText(e));
          timer = setTimeout(poll, 10000);
        }
      }
    }
    async function boot() {
      try {
        if (hosting) {
          show(s.media!);
          s.media!.getVideoTracks()[0]?.addEventListener("ended", trackEnded);
          void poll();
          return;
        }
        if (!window.RTCPeerConnection)
          throw new Error("Браузер не поддерживает просмотр эфиров.");
        viewer = new RTCPeerConnection({ iceServers: s.config.iceServers });
        viewer.addTransceiver("video", { direction: "recvonly" });
        viewer.addTransceiver("audio", { direction: "recvonly" });
        viewer.ontrack = (e) => {
          remote.addTrack(e.track);
          show(remote);
        };
        viewer.onconnectionstatechange = () => {
          if (cancelled) return;
          const state = viewer!.connectionState;
          if (state === "connected") {
            setStatus("Прямой эфир");
            setNetworkError("");
            setError("");
            clearTimeout(connectionTimer);
          } else if (state === "failed") {
            setNetworkError(networkMessage);
            setStatus("Нет соединения");
          } else if (state === "disconnected")
            setStatus("Соединение прервалось…");
        };
        await viewer.setLocalDescription(await viewer.createOffer());
        await gather(viewer);
        if (cancelled) return;
        await api(`streams/${s.id}/join`, "POST", {
          peerId: peerId.current,
          offer: viewer.localDescription!.toJSON(),
        });
        joinedServer = true;
        if (cancelled) {
          void api(`streams/${s.id}/leave`, "POST", {
            peerId: peerId.current,
          }).catch(() => {});
          return;
        }
        setJoined(true);
        connectionTimer = setTimeout(() => {
          if (!cancelled && viewer?.connectionState !== "connected") {
            setNetworkError(networkMessage);
            setStatus("Нет соединения");
          }
        }, 35000);
        void poll();
      } catch (e) {
        if (!cancelled) {
          setError(errorText(e));
          setStatus("Не удалось подключиться");
        }
      }
    }
    function trackEnded() {
      if (cancelled) return;
      void api(`streams/${s.id}/end`, "POST", { hostKey: s.hostKey }).catch(
        () => {},
      );
      finish();
      clearTimeout(timer);
    }
    const startup = setTimeout(() => void boot(), 0);
    const leaving = (e: BeforeUnloadEvent) => {
      if (hosting) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => {
      cancelled = true;
      clearTimeout(startup);
      clearTimeout(timer);
      clearTimeout(connectionTimer);
      window.removeEventListener("beforeunload", leaving);
      s.media?.getVideoTracks()[0]?.removeEventListener("ended", trackEnded);
      viewer?.close();
      peers.forEach((p) => p.pc.close());
      teardown.current = setTimeout(() => {
        stopLocal();
        if (hosting)
          void api(`streams/${s.id}/end`, "POST", { hostKey: s.hostKey }).catch(
            () => {},
          );
        else if (joinedServer)
          void api(`streams/${s.id}/leave`, "POST", {
            peerId: peerId.current,
          }).catch(() => {});
      }, 0);
    };
  }, [s, hosting]);
  return (
    <section className="stream-room">
      <header className="page-header">
        <button
          className="secondary"
          onClick={() => {
            if (
              !hosting ||
              ended ||
              confirm("Завершить эфир для всех зрителей?")
            )
              onClose();
          }}
        >
          <ArrowLeft size={18} />
          {hosting && !ended ? "Завершить эфир" : "Все стримы"}
        </button>
        <span className="stream-live">
          <Radio size={16} />
          {ended ? "ЗАВЕРШЁН" : "LIVE"}
        </span>
      </header>
      <h1>{s.title}</h1>
      <div className="stream-layout">
        <div>
          <div className="stream-player">
            {ended ? (
              <p className="stream-ended">Эфир завершён</p>
            ) : (
              <video
                ref={video}
                autoPlay
                playsInline
                controls
                muted={hosting}
              />
            )}
            {playBlocked && !ended && (
              <button
                className="primary stream-play"
                onClick={() =>
                  void video.current
                    ?.play()
                    .then(() => setPlayBlocked(false))
                    .catch(() => setError("Нажми воспроизведение в плеере."))
                }
              >
                Смотреть со звуком
              </button>
            )}
          </div>
          <p role="status">
            {status} · {viewers} / 8 зрителей
          </p>
          {hosting && !ended && (
            <button
              className="secondary"
              onClick={() => {
                s.media?.getAudioTracks().forEach((t) => {
                  t.enabled = muted;
                });
                setMuted(!muted);
              }}
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}{" "}
              {muted ? "Включить микрофон" : "Выключить микрофон"}
            </button>
          )}
          {!s.config.relayConfigured && (
            <p className="muted small">
              Эфир через прямое соединение: некоторые сети могут блокировать
              просмотр. Ведущему нужно держать вкладку открытой.
            </p>
          )}
          {networkError && (
            <p className="error" role="alert">
              {networkError}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <section className="stream-chat">
          <h2>Чат эфира</h2>
          <div
            className="stream-chat-lines"
            ref={chat}
            role="log"
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            }}
          >
            {!lines.length && <p className="muted">Сообщений пока нет</p>}
            {lines.map((m) => (
              <p key={m.id}>
                <strong>
                  <UserName user={m.author} />
                </strong>
                <span>{m.body}</span>
              </p>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (sendingRef.current || !body.trim()) return;
              sendingRef.current = true;
              setSending(true);
              try {
                await api(`streams/${s.id}/messages`, "POST", {
                  id: crypto.randomUUID(),
                  body,
                  ...(hosting
                    ? { hostKey: s.hostKey }
                    : { peerId: peerId.current }),
                });
                setBody("");
                stick.current = true;
              } catch (e) {
                setError(errorText(e));
              } finally {
                sendingRef.current = false;
                setSending(false);
              }
            }}
          >
            <input
              aria-label="Сообщение в чат эфира"
              placeholder="Написать в чат…"
              maxLength={500}
              value={body}
              disabled={!joined || ended}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              className="primary"
              aria-label="Отправить"
              disabled={sending || !joined || ended || !body.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}

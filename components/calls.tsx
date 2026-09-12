"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { api, Avatar, errorText, UserName } from "./shared";
import { registerDevice } from "./preferences";
import {
  encryptMessage,
  decryptMessage,
  identityFor,
  type Envelope,
  type PublicDevice,
} from "@/lib/crypto-chat";
import type { Chat, User } from "@/lib/types";
type Call = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  caller_device: string;
  callee_device: string | null;
  state: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  peer?: User;
  offer?: Envelope;
  answer?: Envelope;
};
type Signal = { callId: string; description: RTCSessionDescriptionInit };
type Active = {
  call: Call;
  peer: User;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
  deviceId: string;
  devices: PublicDevice[];
  outgoing: boolean;
  answerApplied: boolean;
};
const CallsContext = createContext<{
  start: (chat: Chat) => void;
  busy: boolean;
}>({ start: () => {}, busy: false });
export const useCalls = () => useContext(CallsContext);
function terminal(state: string) {
  return !["ringing", "connecting", "active"].includes(state);
}
async function gathered(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    // Non-trickle signaling must allow slower networks to finish gathering.
    const timeout = setTimeout(done, 15000);
    function done() {
      clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}
export function CallProvider({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const active = useRef<Active | null>(null),
    remote = useRef<HTMLAudioElement | null>(null),
    ring = useRef<HTMLAudioElement | null>(null),
    starting = useRef(false),
    polling = useRef(false),
    lastBeat = useRef(0),
    disconnected = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [current, setCurrent] = useState<Call | null>(null),
    [peer, setPeer] = useState<User | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(false),
    [minimized, setMinimized] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [connectedAt, setConnectedAt] = useState<number | null>(null),
    [security, setSecurity] = useState(""),
    [relay, setRelay] = useState(true),
    [audioBlocked, setAudioBlocked] = useState(false),
    [loading, setLoading] = useState(false);
  const stopRing = () => {
    if (ring.current) {
      ring.current.pause();
      ring.current.src = "";
      ring.current = null;
    }
  };
  function cleanup() {
    stopRing();
    if (disconnected.current) clearTimeout(disconnected.current);
    const a = active.current;
    active.current = null;
    if (a?.pc) {
      a.pc.onconnectionstatechange = null;
      a.pc.close();
    }
    a?.stream?.getTracks().forEach((t) => t.stop());
    if (remote.current) remote.current.srcObject = null;
    setCurrent(null);
    setConnectedAt(null);
    setSecurity("");
    setMuted(false);
    setMinimized(false);
    setLoading(false);
    starting.current = false;
  }
  async function finish(action = "end") {
    const a = active.current;
    cleanup();
    if (a?.deviceId) {
      try {
        await api(`calls/${a.call.id}`, "POST", {
          action,
          deviceId: a.deviceId,
        });
      } catch (e) {
        setError(errorText(e));
      }
    }
  }
  function ringtone() {
    stopRing();
    const index = (crypto.getRandomValues(new Uint8Array(1))[0] % 2) + 1;
    ring.current = new Audio(`/ringtone${index}.mp3`);
    ring.current.loop = true;
    ring.current.volume = 0.65;
    ring.current.play().catch(() => setAudioBlocked(true));
  }
  function show(a: Active) {
    active.current = a;
    setCurrent(a.call);
    setPeer(a.peer);
    setError("");
    setMinimized(false);
    setElapsed(0);
    setAudioBlocked(false);
    lastBeat.current = 0;
  }
  async function safetyCode(pc: RTCPeerConnection) {
    const a = pc.localDescription?.sdp.match(
        /a=fingerprint:sha-256 (.+)/i,
      )?.[1],
      b = pc.remoteDescription?.sdp.match(/a=fingerprint:sha-256 (.+)/i)?.[1];
    if (!a || !b) return;
    const data = new TextEncoder().encode(
      [a.trim(), b.trim()].sort().join("|"),
    );
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    setSecurity(
      Array.from(hash.slice(0, 6), (v) => v.toString(16).padStart(2, "0"))
        .join(" ")
        .toUpperCase(),
    );
  }
  async function makePeer(stream: MediaStream) {
    const config = await api<{
      iceServers: RTCIceServer[];
      relayConfigured: boolean;
    }>("calls/config");
    setRelay(config.relayConfigured);
    const pc = new RTCPeerConnection({ iceServers: config.iceServers, iceCandidatePoolSize: 2 });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remote.current) {
        remote.current.srcObject = e.streams[0] || new MediaStream([e.track]);
        remote.current.play().catch(() => setAudioBlocked(true));
      }
    };
    pc.onconnectionstatechange = () => {
      if (active.current?.pc !== pc) return;
      const state = pc.connectionState;
      if (state === "connected") {
        if (disconnected.current) clearTimeout(disconnected.current);
        stopRing();
        setConnectedAt((previous) => previous ?? Date.now());
        setStatus("На связи");
        void safetyCode(pc);
      } else if (state === "failed") {
        setError(
          "Соединение не установлено. Попробуй другую сеть. Для сложных мобильных сетей требуется TURN-сервер.",
        );
        void finish("fail");
      } else if (state === "disconnected") {
        setStatus("Восстанавливаем связь…");
        if (disconnected.current) clearTimeout(disconnected.current);
        disconnected.current = setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            setError("Связь прервалась.");
            void finish("fail");
          }
        }, 20000);
      }
    };
    return pc;
  }
  async function microphone() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw Error(
        "Этот браузер не поддерживает звонки. Открой TELEJKA в Safari или Chrome по HTTPS.",
      );
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  }
  async function start(chat: Chat) {
    if (starting.current || active.current) return;
    if (chat.is_group) {
      setError("Голосовые звонки пока доступны в личных чатах.");
      return;
    }
    starting.current = true;
    setLoading(true);
    setError("");
    let stream: MediaStream | null = null,
      pc: RTCPeerConnection | null = null;
    try {
      stream = await microphone();
      const identity = await registerDevice(user.id);
      const devices = await api<PublicDevice[]>(`chats/${chat.id}/keys`);
      const other = chat.participants.find((p) => p.id !== user.id);
      if (!other) throw Error("Собеседник не найден.");
      if (!devices.some((d) => d.user_id === other.id))
        throw Error("Собеседнику нужно хотя бы раз открыть TELEJKA.");
      pc = await makePeer(stream);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const id = crypto.randomUUID();
      const offer = await encryptMessage(
        id,
        {
          callId: id,
          description: { type: "offer", sdp: pc.localDescription!.sdp },
        },
        devices,
      );
      await api("calls", "POST", {
        id,
        chatId: chat.id,
        deviceId: identity.id,
        offer,
      });
      show({
        call: {
          id,
          conversation_id: chat.id,
          caller_id: user.id,
          callee_id: other.id,
          caller_device: identity.id,
          callee_device: null,
          state: "ringing",
          created_at: new Date().toISOString(),
          answered_at: null,
          ended_at: null,
        },
        peer: other,
        pc,
        stream,
        deviceId: identity.id,
        devices,
        outgoing: true,
        answerApplied: false,
      });
      setStatus("Вызываем…");
      ringtone();
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      pc?.close();
      setError(errorText(e));
    } finally {
      starting.current = false;
      setLoading(false);
    }
  }
  async function accept() {
    const a = active.current;
    if (!a || a.outgoing || starting.current) return;
    starting.current = true;
    setLoading(true);
    stopRing();
    let stream: MediaStream | null = null;
    try {
      // getUserMedia and playback originate from the explicit Answer action.
      if (remote.current) {
        remote.current.play().catch(() => {});
      }
      stream = await microphone();
      const identity = await registerDevice(user.id);
      const details = await api<Call>(`calls/${a.call.id}`);
      if (details.state !== "ringing")
        throw Error("Звонок уже завершён или принят на другом устройстве.");
      const signal = await decryptMessage<Signal>(
        a.call.id,
        details.offer!,
        identity,
      );
      if (signal.callId !== a.call.id || signal.description.type !== "offer")
        throw Error("Не удалось проверить защищённый звонок.");
      const devices = await api<PublicDevice[]>(
        `chats/${a.call.conversation_id}/keys`,
      );
      if (active.current !== a) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const pc = await makePeer(stream);
      if (active.current !== a) {
        pc.close();
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      a.pc = pc;
      a.stream = stream;
      a.deviceId = identity.id;
      a.devices = devices;
      await pc.setRemoteDescription(signal.description);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      const answer = await encryptMessage(
        a.call.id,
        {
          callId: a.call.id,
          description: { type: "answer", sdp: pc.localDescription!.sdp },
        },
        devices.filter((d) => d.id === a.call.caller_device),
      );
      if (active.current !== a) return;
      await api(`calls/${a.call.id}`, "POST", {
        action: "accept",
        deviceId: identity.id,
        answer,
      });
      if (active.current !== a) return;
      a.call.state = "connecting";
      a.call.callee_device = identity.id;
      setStatus("Соединяем…");
      setCurrent({ ...a.call });
      void safetyCode(pc);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      if (active.current === a) {
        setError(errorText(e));
        await finish("fail");
      }
    } finally {
      starting.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    async function poll() {
      if (polling.current || starting.current) return;
      polling.current = true;
      try {
        const a = active.current;
        if (a) {
          const latest = await api<Call>(`calls/${a.call.id}`);
          if (!alive || active.current !== a) return;
          if (terminal(latest.state)) {
            setStatus(
              latest.state === "declined"
                ? "Вызов отклонён"
                : latest.state === "missed"
                  ? "Нет ответа"
                  : "Звонок завершён",
            );
            cleanup();
            return;
          }
          if (
            !a.outgoing &&
            latest.callee_device &&
            latest.callee_device !== a.deviceId
          ) {
            cleanup();
            return;
          }
          a.call = latest;
          setCurrent(latest);
          if (a.outgoing && latest.answer && !a.answerApplied && a.pc) {
            const identity = await identityFor(user.id);
            const signal = await decryptMessage<Signal>(
              latest.id,
              latest.answer,
              identity,
            );
            if (
              signal.callId !== latest.id ||
              signal.description.type !== "answer"
            )
              throw Error("Неверный защищённый ответ.");
            await a.pc.setRemoteDescription(signal.description);
            a.answerApplied = true;
            stopRing();
            setStatus("Соединяем…");
            void safetyCode(a.pc);
          }
          if (
            a.deviceId &&
            Date.now() - lastBeat.current > 10000 &&
            (a.outgoing || latest.callee_device === a.deviceId)
          ) {
            lastBeat.current = Date.now();
            await api(`calls/${latest.id}`, "POST", {
              action: "heartbeat",
              deviceId: a.deviceId,
            });
          }
        } else if (!document.hidden) {
          const calls = await api<Call[]>("calls");
          if (!alive || active.current || starting.current) return;
          const incoming = calls.find(
            (c) => c.callee_id === user.id && c.state === "ringing",
          );
          if (incoming?.peer) {
            const identity = await registerDevice(user.id);
            show({
              call: incoming,
              peer: incoming.peer,
              pc: null,
              stream: null,
              deviceId: identity.id,
              devices: [],
              outgoing: false,
              answerApplied: false,
            });
            setStatus("Входящий звонок");
            ringtone();
          }
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        polling.current = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 1800);
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      stopRing();
      active.current?.pc?.close();
      active.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, [user.id]);
  useEffect(() => {
    if (connectedAt === null) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - connectedAt) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [connectedAt]);
  const duration = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;
  return (
    <CallsContext.Provider value={{ start, busy: !!current || loading }}>
      {children}
      <audio ref={remote} autoPlay playsInline />
      {error && (
        <div className="call-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")}>Закрыть</button>
        </div>
      )}
      {loading && !current && (
        <div className="call-preparing" role="status">
          Подготовка защищённого звонка…
        </div>
      )}
      {current &&
        peer &&
        (minimized ? (
          <button className="call-mini" onClick={() => setMinimized(false)}>
            <Phone size={18} />
            {peer.name} · {connectedAt ? duration : status}
          </button>
        ) : (
          <section
            className="call-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Голосовой звонок"
          >
            <button
              className="call-minimize"
              onClick={() => setMinimized(true)}
              aria-label="Свернуть звонок"
            >
              <ChevronDown />
            </button>
            <div className="call-person">
              <Avatar user={peer} size={100} />
              <h2>
                <UserName user={peer} />
              </h2>
              <p aria-live="polite">{connectedAt ? duration : status}</p>
              <span className="call-encrypted">
                <ShieldCheck size={16} />
                Сквозное шифрование
              </span>
            </div>
            {!relay && (
              <p className="call-network-note">
                Некоторые мобильные сети пока не поддерживаются.
              </p>
            )}
            {security && (
              <details className="call-security">
                <summary>Проверить защиту звонка</summary>
                <p>
                  Сравните этот код голосом. У вас обоих он должен совпадать.
                </p>
                <code>{security}</code>
              </details>
            )}
            {audioBlocked && (
              <button
                className="secondary"
                onClick={() => {
                  remote.current?.play().catch(() => {});
                  ring.current?.play().catch(() => {});
                  setAudioBlocked(false);
                }}
              >
                <Volume2 size={18} />
                Включить звук
              </button>
            )}
            <div className="call-controls">
              {!active.current?.outgoing && current.state === "ringing" ? (
                <>
                  <button
                    className="call-control answer"
                    disabled={loading}
                    onClick={accept}
                  >
                    <Phone />
                    <span>Ответить</span>
                  </button>
                  <button
                    className="call-control hangup"
                    onClick={() => finish("decline")}
                  >
                    <PhoneOff />
                    <span>Отклонить</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="call-control"
                    aria-pressed={muted}
                    onClick={() => {
                      const next = !muted;
                      active.current?.stream
                        ?.getAudioTracks()
                        .forEach((t) => (t.enabled = !next));
                      setMuted(next);
                    }}
                  >
                    {muted ? <MicOff /> : <Mic />}
                    <span>{muted ? "Включить микрофон" : "Микрофон"}</span>
                  </button>
                  <button
                    className="call-control hangup"
                    onClick={() => finish()}
                  >
                    <PhoneOff />
                    <span>Завершить</span>
                  </button>
                </>
              )}
            </div>
          </section>
        ))}
    </CallsContext.Provider>
  );
}
export function CallHistory({ onOpen }: { onOpen: (chatId: string) => void }) {
  const [calls, setCalls] = useState<Call[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<Call[]>("calls?history=1")
      .then((v) => {
        if (alive) setCalls(v);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="call-history">
      {error && <p className="error">{error}</p>}
      {!calls.length && !error && <p className="muted">Звонков пока нет.</p>}
      {calls.map((c) => (
        <button
          key={c.id}
          className="call-history-row"
          onClick={() => onOpen(c.conversation_id)}
        >
          {c.peer && <Avatar user={c.peer} />}
          <span>
            <strong>{c.peer?.name || "Пользователь"}</strong>
            <small>
              {c.state === "missed"
                ? "Пропущенный"
                : c.state === "declined"
                  ? "Отклонённый"
                  : c.state === "failed"
                    ? "Не удалось соединиться"
                    : c.state === "ended"
                      ? "Завершённый"
                      : "Звонок"}{" "}
              ·{" "}
              {new Date(c.created_at).toLocaleString("ru", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </span>
          <Phone size={18} />
        </button>
      ))}
    </div>
  );
}

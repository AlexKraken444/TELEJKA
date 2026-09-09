"use client";
import { useEffect, useRef, useState } from "react";
import type { User, Reaction, Chat } from "@/lib/types";
import { api, errorText, UserName } from "./shared";
type Wallet = {
  balance: number;
  streak: number;
  plus_active: boolean;
  plus_until?: string;
  granted?: number;
  quest: {
    kind: "posts" | "messages" | "comments";
    target: number;
    progress: number;
    claimed: boolean;
  };
};
export function DailyVisit({ userId }: { userId: string }) {
  useEffect(() => {
    const visit = () => {
      if (!document.hidden)
        api<Wallet>("rewards/visit", "POST", {}).catch(() => {});
    };
    visit();
    const timer = setInterval(visit, 60000);
    window.addEventListener("focus", visit);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", visit);
    };
  }, [userId]);
  return null;
}
export function Rewards({ onUpdated }: { onUpdated: (u: User) => void }) {
  const [wallet, setWallet] = useState<Wallet | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Wallet>("rewards")
        .then((w) => {
          if (active) setWallet(w);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  async function action(buy: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (buy && !request.current) request.current = crypto.randomUUID();
      setWallet(
        await api<Wallet>(
          buy ? "plus/buy" : "rewards/claim",
          "POST",
          buy ? { requestId: request.current } : {},
        ),
      );
      request.current = null;
      onUpdated(await api<User>("me"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-pad community">
      <h1>БАТОНчики</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {wallet ? (
        <>
          <div className="reward-card balance-card">
            <img src="/baton.png" alt="БАТОНчик" />
            <div>
              <small>Твой баланс</small>
              <h2>{wallet.balance} БАТОНчиков</h2>
              <p>Дней подряд: {wallet.streak}</p>
            </div>
          </div>
          <p className="muted">
            За вход каждый день: 15, 30, 45… После пропуска — снова 15. Новый
            день начинается в 00:00 по Москве.
          </p>
          <div className="reward-card">
            <h2>Задание дня · +30</h2>
            <p>
              {
                {
                  messages: "Написать 10 сообщений",
                  posts: "Написать 3 поста",
                  comments: "Написать один комментарий",
                }[wallet.quest.kind]
              }
            </p>
            <progress
              aria-label="Прогресс задания"
              max={wallet.quest.target}
              value={wallet.quest.progress}
            />
            <p>
              {wallet.quest.progress} / {wallet.quest.target}
            </p>
            <button
              className="primary"
              disabled={
                busy ||
                wallet.quest.claimed ||
                wallet.quest.progress < wallet.quest.target
              }
              onClick={() => action(false)}
            >
              {wallet.quest.claimed
                ? "Награда получена"
                : "Получить 30 БАТОНчиков"}
            </button>
          </div>
          <div className="reward-card plus-card">
            <h2>TELEJKA+</h2>
            <p>100 БАТОНчиков на месяц</p>
            <p>
              10 реакций на посты и сообщения · до 3 на публикацию.
              <br />
              Свой цвет имени.
              <br />
              Закрытый профиль с выбором пользователей, которым открыт доступ.
            </p>
            {wallet.plus_active && (
              <p>
                Действует до{" "}
                {new Date(wallet.plus_until!).toLocaleDateString("ru")}
              </p>
            )}
            <button
              className="primary"
              disabled={busy || wallet.balance < 100}
              onClick={() => action(true)}
            >
              {wallet.plus_active ? "Продлить на месяц" : "Купить TELEJKA+"}
            </button>
            <p className="muted small">
              Без автоматического списания. Настройки подписки — в профиле.
            </p>
          </div>
        </>
      ) : (
        <p>Загрузка…</p>
      )}
    </section>
  );
}
export function Reactions({
  path,
  initial,
  user,
}: {
  path: string;
  initial?: Reaction[];
  user: User;
}) {
  const [rows, setRows] = useState(initial || []),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setRows(initial || []);
  }, [initial]);
  async function toggle(emoji: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setRows(
        await api<Reaction[]>(path + "/reactions", "POST", {
          emoji,
          active: !rows.find((r) => r.emoji === emoji)?.mine,
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reactions">
      {rows.map((r) => (
        <button
          key={r.emoji}
          className={r.mine ? "reaction selected" : "reaction"}
          disabled={busy || (!user.plus_active && !r.mine)}
          onClick={() => toggle(r.emoji)}
          aria-pressed={r.mine}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      {user.plus_active && (
        <button
          className="reaction"
          onClick={() => setOpen(!open)}
          aria-label="Выбрать реакцию"
        >
          ☺ +
        </button>
      )}
      {open && (
        <div className="reaction-picker">
          {["😁", "😳", "🥺", "🤮", "😮", "😱", "🤬", "😎", "👎", "👍"].map(
            (e) => (
              <button
                disabled={busy}
                key={e}
                onClick={() => toggle(e)}
                aria-label={"Реакция " + e}
              >
                {e}
              </button>
            ),
          )}
          <small>Максимум 3 реакции</small>
        </div>
      )}
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </div>
  );
}
type Preferences = {
  is_private: boolean;
  name_color: string | null;
  plus_active: boolean;
  allowed: User[];
  blocked: User[];
};
export function PlusSettings({ onSaved }: { onSaved: (u: User) => void }) {
  const [data, setData] = useState<Preferences | null>(null),
    [people, setPeople] = useState<User[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    api<Preferences>("me/preferences")
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    let active = true;
    const t = setTimeout(
      () =>
        api<User[]>("users?q=" + encodeURIComponent(query))
          .then((p) => {
            if (active) setPeople(p);
          })
          .catch((e) => setError(errorText(e))),
      250,
    );
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);
  async function save() {
    if (!data || busy) return;
    setBusy(true);
    setSaved(false);
    try {
      await api("me/preferences", "PATCH", {
        is_private: data.is_private,
        name_color: data.name_color,
        allowed_ids: data.allowed.map((p) => p.id),
      });
      onSaved(await api<User>("me"));
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-pad community">
      <h2>TELEJKA+ · настройки</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.plus_active
              ? "Подписка активна"
              : "Подписка доступна в разделе «БАТОНчики»."}
          </p>
          <label className="setting-row">
            Цвет имени
            <input
              type="color"
              aria-label="Цвет имени"
              disabled={!data.plus_active}
              value={data.name_color || "#398ce8"}
              onChange={(e) => setData({ ...data, name_color: e.target.value })}
            />
          </label>
          <button
            className="text-button"
            onClick={() => setData({ ...data, name_color: null })}
          >
            Обычный цвет
          </button>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={data.is_private}
              disabled={!data.plus_active && !data.is_private}
              onChange={(e) =>
                setData({ ...data, is_private: e.target.checked })
              }
            />
            Закрытый аккаунт 🔐
          </label>
          {data.is_private && (
            <>
              <p className="muted">
                Только выбранные люди смогут видеть профиль и посты и писать
                лично. После окончания подписки аккаунт остаётся закрытым.
              </p>
              <input
                aria-label="Найти пользователя для доступа"
                placeholder="Найти пользователя"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="access-list">
                {[
                  ...new Map(
                    [...data.allowed, ...people].map((p) => [p.id, p]),
                  ).values(),
                ].map((p) => (
                  <label className="setting-row" key={p.id}>
                    <input
                      type="checkbox"
                      disabled={!data.plus_active}
                      checked={data.allowed.some((x) => x.id === p.id)}
                      onChange={(e) =>
                        setData({
                          ...data,
                          allowed: e.target.checked
                            ? [...data.allowed, p]
                            : data.allowed.filter((x) => x.id !== p.id),
                        })
                      }
                    />
                    <UserName user={p} />
                  </label>
                ))}
              </div>
            </>
          )}
          <button className="primary" disabled={busy} onClick={save}>
            Сохранить настройки
          </button>
          {saved && <p role="status">Сохранено</p>}
          <h3>Заблокированные пользователи</h3>
          {!data.blocked.length && <p className="muted">Список пуст</p>}
          {data.blocked.map((p) => (
            <div className="setting-row" key={p.id}>
              <UserName user={p} />
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api("users/" + p.id + "/block", "POST", {
                      blocked: false,
                    });
                    setData({
                      ...data,
                      blocked: data.blocked.filter((x) => x.id !== p.id),
                    });
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Разблокировать
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function ProfileActions({
  user,
  person,
  onChanged,
}: {
  user: User;
  person: User;
  onChanged: (p: User) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(badge: boolean) {
    setBusy(true);
    try {
      await api(
        "users/" + person.id + (badge ? "/verification" : "/block"),
        badge ? "PATCH" : "POST",
        badge ? { verified: !person.verified } : { blocked: !person.blocked },
      );
      onChanged(await api<User>("users/" + person.id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-actions">
      {user.can_manage_verification && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => action(true)}
        >
          {person.verified ? "Убрать галочку" : "Поставить галочку"}
        </button>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => action(false)}
      >
        {person.blocked ? "Разблокировать" : "Заблокировать"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ChatActions({
  chat,
  user,
  onDeleted,
}: {
  chat: Chat;
  user: User;
  onDeleted: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const label = !chat.is_group
    ? "Удалить контакт"
    : chat.created_by === user.id
      ? "Удалить группу для всех"
      : "Выйти из группы";
  return (
    <details className="chat-actions">
      <summary aria-label="Действия с чатом">•••</summary>
      <div>
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            if (!confirm(label + "?")) return;
            setBusy(true);
            try {
              await api("chats/" + chat.id, "DELETE");
              onDeleted();
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          }}
        >
          {label}
        </button>
        {!chat.is_group && (
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              const p = chat.participants.find((p) => p.id !== user.id);
              if (!p) return;
              try {
                await api("users/" + p.id + "/block", "POST", {
                  blocked: !p.blocked,
                });
                onDeleted();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            {chat.participants.find((p) => p.id !== user.id)?.blocked
              ? "Разблокировать"
              : "Заблокировать"}
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </details>
  );
}

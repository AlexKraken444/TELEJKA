"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, errorText } from "./shared";
export function BatonIcon() {
  return <img className="baton-icon" src="/baton.png" alt="БАТОНчики" />;
}
function CommerceDialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
        if (e.key === "Tab") {
          const items = panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),a[href]",
          );
          if (items?.length) {
            const first = items[0],
              last = items[items.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === panel.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className="modal commerce-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function TransferButton({
  chatId,
  name,
  onSent,
}: {
  chatId: string;
  name: string;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false),
    [amount, setAmount] = useState("15"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [balance, setBalance] = useState("");
  const request = useRef<string | null>(null),
    inFlight = useRef(false);
  function show() {
    setError("");
    setOpen(true);
    request.current = null;
    void api<{ balance: string | number; unlimited: boolean }>("rewards")
      .then((w) => setBalance(w.unlimited ? "∞" : String(w.balance)))
      .catch((e) => setError(errorText(e)));
  }
  return (
    <>
      <button
        type="button"
        className="icon-button"
        title="Отправить БАТОНчики"
        aria-label="Отправить БАТОНчики"
        onClick={show}
      >
        <BatonIcon />
      </button>
      {open && (
        <CommerceDialog
          title="Отправить БАТОНчики"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <p>
            Получатель: <strong>{name}</strong>
          </p>
          <p>На балансе: {balance || "…"}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (inFlight.current) return;
              inFlight.current = true;
              setBusy(true);
              setError("");
              request.current ??= crypto.randomUUID();
              try {
                await api("chats/" + chatId + "/batons", "POST", {
                  amount: Number(amount),
                  requestId: request.current,
                });
                setOpen(false);
                onSent();
              } catch (err) {
                setError(errorText(err));
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              Количество
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                required
                value={amount}
                disabled={busy}
                onChange={(e) => {
                  setAmount(e.target.value);
                  request.current = null;
                }}
              />
            </label>
            <p className="muted">
              От 1 до 1000. БАТОНчики сразу поступят собеседнику.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              <BatonIcon />
              {busy ? "Отправляем…" : "Отправить " + amount}
            </button>
          </form>
        </CommerceDialog>
      )}
    </>
  );
}
export function TransferReceipt({
  amount,
  own,
}: {
  amount: number;
  own: boolean;
}) {
  return (
    <div className="baton-receipt">
      <BatonIcon />
      <div>
        <strong>{amount} БАТОНчиков</strong>
        <small>{own ? "Перевод отправлен" : "Перевод получен"}</small>
      </div>
    </div>
  );
}
export type AdSlot = {
  slot: number;
  available: boolean;
  id?: string;
  owner_id?: string;
  link?: string;
  ends_at?: string;
};
export function useAdvertisements(enabled: boolean) {
  const [slots, setSlots] = useState<AdSlot[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const refresh = () => {
      void api<{ slots: AdSlot[] }>("ads")
        .then((r) => {
          if (live) setSlots(r.slots);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("telejka-ads-changed", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("telejka-ads-changed", refresh);
    };
  }, [enabled]);
  return enabled ? slots : [];
}
async function adPhoto(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw Error("Выберите PNG, JPG или WebP до 20 МБ.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let value = "";
    for (const quality of [0.8, 0.65, 0.45, 0.25]) {
      value = canvas.toDataURL("image/webp", quality);
      if (value.length <= 350000) return value;
    }
    throw Error("Фото слишком сложное. Выберите другое изображение.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function Advertisement({
  slot,
  userId,
}: {
  slot: AdSlot;
  userId: string;
}) {
  const [open, setOpen] = useState(false),
    [image, setImage] = useState(""),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const request = useRef<string | null>(null),
    inFlight = useRef(false);
  async function contact() {
    if (!slot.owner_id || inFlight.current) return;
    inFlight.current = true;
    setError("");
    try {
      const chat = await api<{ id: string }>("chats", "POST", {
        userIds: [slot.owner_id],
        isGroup: false,
      });
      window.location.assign("/feed?chat=" + chat.id + "&account=" + userId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      inFlight.current = false;
    }
  }
  const photo = slot.id ? (
    <img
      loading="lazy"
      className="ad-photo"
      src={"/api/ads/" + slot.id + "/image"}
      alt="Рекламное объявление"
    />
  ) : null;
  return (
    <aside className="feed-ad" aria-label={"Рекламное место " + slot.slot}>
      <div className="ad-caption">
        <small>Реклама · место {slot.slot}</small>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setOpen(true);
            setSent(false);
            setError("");
          }}
        >
          {slot.available ? "Разместить за 15 / неделю" : "Моя реклама"}
        </button>
      </div>
      {slot.id ? (
        slot.link ? (
          <a
            href={slot.link}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            {photo}
            <span className="ad-link">Открыть рекламу ↗</span>
          </a>
        ) : (
          <button
            className="ad-open"
            type="button"
            onClick={() => void contact()}
          >
            {photo}
            <span className="ad-link">Написать автору →</span>
          </button>
        )
      ) : (
        <button
          className="ad-vacant"
          type="button"
          onClick={() => {
            setOpen(true);
            setSent(false);
          }}
        >
          <BatonIcon />
          <strong>Свободное рекламное место</strong>
          <small>
            {slot.available
              ? "15 БАТОНчиков за неделю"
              : "Заявка на это место проверяется"}
          </small>
        </button>
      )}
      {error && !open && <p role="alert">{error}</p>}
      {open && (
        <CommerceDialog
          title="Реклама в ленте"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <AdHistory />
          {sent ? (
            <p role="status">
              Заявка отправлена на модерацию. Неделя показа начнётся после
              одобрения.
            </p>
          ) : slot.available ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                setError("");
                request.current ??= crypto.randomUUID();
                try {
                  await api("ads", "POST", {
                    slot: slot.slot,
                    image,
                    link,
                    requestId: request.current,
                  });
                  setSent(true);
                  window.dispatchEvent(new Event("telejka-ads-changed"));
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              <p>
                15 БАТОНчиков за 7 дней после одобрения. При отказе вернём
                оплату.
              </p>
              <label>
                Фотография
                <input
                  disabled={busy}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  required={!image}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    setError("");
                    try {
                      setImage(await adPhoto(f));
                      request.current = null;
                    } catch (err) {
                      setError(errorText(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {image && (
                <img
                  className="ad-photo"
                  src={image}
                  alt="Предпросмотр рекламы"
                />
              )}
              <label>
                Ссылка (необязательно)
                <input
                  disabled={busy}
                  type="url"
                  placeholder="https://…"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    request.current = null;
                  }}
                />
              </label>
              <p className="muted">
                Без ссылки объявление откроет личный чат с тобой.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy || !image}>
                {busy ? "Подождите…" : "Оплатить 15 и отправить на проверку"}
              </button>
            </form>
          ) : (
            <p>Место занято. Выбери свободное место в ленте.</p>
          )}
        </CommerceDialog>
      )}
    </aside>
  );
}
function AdHistory() {
  const [items, setItems] = useState<
    { id: string; slot: number; status: string; ends_at: string | null }[]
  >([]);
  useEffect(() => {
    void api<typeof items>("ads/mine")
      .then(setItems)
      .catch(() => {});
  }, []);
  return items.length ? (
    <details>
      <summary>Мои заявки ({items.length})</summary>
      {items.map((a) => (
        <p key={a.id}>
          Место {a.slot}:{" "}
          {
            (
              {
                pending: "на проверке",
                active: "опубликована",
                rejected: "отклонена, оплата возвращена",
                expired: "показ завершён",
              } as Record<string, string>
            )[a.status]
          }
          {a.ends_at && " · до " + new Date(a.ends_at).toLocaleDateString("ru")}
        </p>
      ))}
    </details>
  ) : null;
}
export function AdAdmin() {
  const [password, setPassword] = useState(""),
    [unlocked, setUnlocked] = useState(false),
    [items, setItems] = useState<
      { id: string; slot: number; name: string; link: string; status: string }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setItems(await api<typeof items>("adadmin"));
    setUnlocked(true);
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, []);
  return (
    <main className="ad-admin">
      <a href="/feed">← В TELEJKA</a>
      <h1>Модерация рекламы</h1>
      <p>Пять мест в ленте. Одобренная реклама показывается семь дней.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!unlocked ? (
        <form
          className="settings-card commerce-dialog"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("adadmin/login", "POST", { password });
              setPassword("");
              await refresh();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Пароль модерации
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Войти
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => void refresh().catch((e) => setError(errorText(e)))}
          >
            Обновить
          </button>
          {!items.length && <p>Заявок пока нет.</p>}
          {items.map((ad) => (
            <article className="settings-card ad-review" key={ad.id}>
              <h2>
                Место {ad.slot} · {ad.name}
              </h2>
              <img
                className="ad-photo"
                src={"/api/ads/" + ad.id + "/image"}
                alt="Реклама на проверке"
              />
              {ad.link ? (
                <a href={ad.link} target="_blank" rel="noopener noreferrer">
                  {ad.link}
                </a>
              ) : (
                <p>Переход в личный чат автора</p>
              )}
              {ad.status === "pending" ? (
                <div className="content-tools">
                  {[true, false].map((approve) => (
                    <button
                      key={String(approve)}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api("adadmin/" + ad.id, "POST", { approve });
                          await refresh();
                        } catch (e) {
                          setError(errorText(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {approve
                        ? "Одобрить и опубликовать"
                        : "Отклонить и вернуть оплату"}
                    </button>
                  ))}
                </div>
              ) : (
                <p>Опубликована</p>
              )}
            </article>
          ))}
        </>
      )}
    </main>
  );
}

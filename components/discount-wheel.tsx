"use client";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "./shared";
export type Discount = { available: boolean; percent: number };
export function DiscountWheel({
  discount,
  onResult,
  onBusy,
}: {
  discount: Discount;
  onResult: (discount: Discount) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [rotation, setRotation] = useState(() =>
      discount.percent ? 360 - (36 + (discount.percent / 10 - 1) * 72) : 0,
    );
  const inFlight = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (!discount.available) return null;
  return (
    <section className="reward-card discount-card">
      <h2>Скидка на первую подписку</h2>
      <p>
        Одно бесплатное вращение на аккаунт. Скидка от 10% до 50% на первую
        покупку mini или PLUS. Все пять результатов равновероятны.
      </p>
      <div className="discount-wheel-wrap" aria-hidden="true">
        <span className="wheel-pointer">▼</span>
        <div
          className="discount-wheel"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          {[10, 20, 30, 40, 50].map((p, i) => (
            <span
              key={p}
              style={{
                transform: `translate(-50%,-50%) rotate(${36 + i * 72}deg) translateY(-76px) rotate(${-36 - i * 72}deg)`,
              }}
            >
              {p}%
            </span>
          ))}
        </div>
      </div>
      {discount.percent > 0 ? (
        <p role="status">
          <strong>Твоя скидка: {discount.percent}%</strong>. Уже учтена в ценах
          ниже и сохранится после перезагрузки.
        </p>
      ) : (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            onBusy(true);
            setError("");
            try {
              const result = await api<Discount>(
                "subscriptions/discount/spin",
                "POST",
                {},
              );
              if (!alive.current) return;
              setRotation(
                360 * 5 + 360 - (36 + (result.percent / 10 - 1) * 72),
              );
              await new Promise((resolve) => setTimeout(resolve, 1900));
              if (alive.current) onResult(result);
            } catch (e) {
              if (alive.current) setError(errorText(e));
            } finally {
              inFlight.current = false;
              if (alive.current) {
                setBusy(false);
                onBusy(false);
              }
            }
          }}
        >
          {busy ? "Колесо вращается…" : "Крутить бесплатно"}
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

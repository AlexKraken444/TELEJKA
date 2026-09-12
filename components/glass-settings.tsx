"use client";
import { useEffect, useState } from "react";
const defaults = { transparency: 100, blur: 18, gloss: 70 };
type Settings = typeof defaults;
function read(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem("telejka-glass") || "{}");
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        typeof data[key] === "number" && Number.isFinite(data[key])
          ? Math.max(0, Math.min(key === "blur" ? 40 : 100, data[key]))
          : value,
      ]),
    ) as Settings;
  } catch {
    return defaults;
  }
}
function apply(s: Settings) {
  const style = document.documentElement.style;
  style.setProperty("--button-fill", String((100 - s.transparency) / 100));
  style.setProperty("--button-blur", `${s.blur}px`);
  style.setProperty("--button-gloss", String(s.gloss / 100));
}
export function GlassEffects() {
  useEffect(() => {
    apply(read());
    const sync = () => apply(read());
    window.addEventListener("storage", sync);
    const down = (event: PointerEvent) => {
      const button = (event.target as Element)?.closest<HTMLElement>(
        "button,summary,.message-attach,.file-picker-label",
      );
      if (!button || button.matches(':disabled,[aria-disabled="true"]')) return;
      const box = button.getBoundingClientRect();
      button.style.setProperty("--touch-x", `${event.clientX - box.left}px`);
      button.style.setProperty("--touch-y", `${event.clientY - box.top}px`);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        button.animate([{ scale: "1" }, { scale: ".96" }, { scale: "1" }], {
          duration: 320,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
    };
    document.addEventListener("pointerdown", down, { passive: true });
    return () => {
      window.removeEventListener("storage", sync);
      document.removeEventListener("pointerdown", down);
    };
  }, []);
  return null;
}
export function GlassSettings() {
  const [settings, setSettings] = useState(defaults),
    [saved, setSaved] = useState(true);
  useEffect(() => setSettings(read()), []);
  function update(next: Settings) {
    setSettings(next);
    apply(next);
    try {
      localStorage.setItem("telejka-glass", JSON.stringify(next));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }
  return (
    <section
      className="section-pad glass-settings"
      aria-labelledby="glass-title"
    >
      <div className="settings-card">
        <h2 id="glass-title">Оформление кнопок</h2>
        <p className="muted">Liquid Glass · настрой под себя</p>
        <div className="glass-preview">
          <span className="glass-preview-orb" />
          <button type="button" className="secondary">
            Попробуй нажать
          </button>
        </div>
        {(
          [
            { key: "transparency", label: "Прозрачность", max: 100, unit: "%" },
            { key: "blur", label: "Размытие фона", max: 40, unit: " px" },
            { key: "gloss", label: "Глянцевость", max: 100, unit: "%" },
          ] as const
        ).map((item) => (
          <label className="glass-slider" key={item.key}>
            <span>
              {item.label}
              <output>
                {settings[item.key]}
                {item.unit}
              </output>
            </span>
            <input
              type="range"
              aria-label={item.label}
              min={0}
              max={item.max}
              value={settings[item.key]}
              onChange={(e) =>
                update({ ...settings, [item.key]: Number(e.target.value) })
              }
            />
            {item.key === "gloss" && <small>Матовые ← → Глянцевые</small>}
          </label>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => update(defaults)}
        >
          Сбросить оформление
        </button>
        <p className="muted small" role="status">
          {saved
            ? "Сохраняется автоматически на этом устройстве."
            : "Применено. Браузер не разрешил сохранить настройки."}
        </p>
      </div>
    </section>
  );
}

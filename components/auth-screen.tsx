"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  MessageCircle,
  Heart,
  Sparkles,
} from "lucide-react";
import { api, Avatar, Logo, errorText, readAvatar } from "./shared";
export function AuthScreen() {
  const [login, setLogin] = useState(false),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [bio, setBio] = useState(""),
    [avatar, setAvatar] = useState<string | null>(null),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`auth/${login ? "login" : "register"}`, "POST", {
        name,
        password,
        bio,
        avatar,
      });
      window.location.assign("/feed");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="story-content">
          <span className="eyebrow">
            <span className="live-dot" /> МЕСТО, ГДЕ ТЕБЯ УСЛЫШАТ
          </span>
          <h1>
            Твои мысли.
            <br />
            Твои люди.
            <br />
            <span>Твоя тележка.</span>
          </h1>
          <p>
            Делись тем, что важно. Находи своих.
            <br />
            Продолжай разговор в личке.
          </p>
          <div className="story-card">
            <div className="story-card-top">
              <span className="mini-star">
                <Sparkles size={20} />
              </span>
              <span>С чего всё начинается</span>
              <ArrowUpRight size={19} />
            </div>
            <p>С одного простого «привет».</p>
            <div className="story-card-bottom">
              <span>
                <MessageCircle size={16} /> Разговоры без расстояний
              </span>
              <Heart size={17} />
            </div>
          </div>
        </div>
        <div className="story-footer">
          <span>Меньше шума. Больше общения.</span>
          <span>↗</span>
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </section>
      <section className="auth-form-side">
        <div className="auth-top">
          {login ? "Ещё не с нами?" : "Уже есть аккаунт?"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setLogin(!login);
              setError("");
            }}
          >
            {login ? "Создать аккаунт" : "Войти"} <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="auth-form-wrap">
          <span className="small-label">
            {login ? "С ВОЗВРАЩЕНИЕМ" : "ДАВАЙ ЗНАКОМИТЬСЯ"}
          </span>
          <h2>{login ? "Снова на связи." : "Тут начинается общение."}</h2>
          <p className="muted">
            {login
              ? "Твои люди и разговоры уже ждут."
              : "Пара деталей — и ты в TELEJKA."}
          </p>
          <form onSubmit={submit}>
            {!login && (
              <div className="avatar-field">
                <label className="upload-avatar">
                  <Avatar
                    user={{ name: name || "Т", avatar, color: "#d8efac" }}
                    size={64}
                  />
                  <span className="camera-badge">
                    <Camera size={13} />
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Загрузить аватар"
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
                <div>
                  <strong>Твоё лицо. Или первая буква.</strong>
                  <p>Добавь аватарку, если хочешь</p>
                  {avatar && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setAvatar(null)}
                    >
                      Удалить фото
                    </button>
                  )}
                </div>
              </div>
            )}
            <label className="field-label">
              Имя пользователя
              <input
                autoComplete="username"
                placeholder="Как тебя зовут?"
                minLength={2}
                maxLength={32}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field-label">
              Пароль
              <div className="password-wrap">
                <input
                  type={show ? "text" : "password"}
                  autoComplete={login ? "current-password" : "new-password"}
                  placeholder="Не менее 8 символов"
                  minLength={8}
                  maxLength={72}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {!login && (
              <label className="field-label">
                О себе <span>необязательно</span>
                <textarea
                  placeholder="Пара слов о тебе и том, что любишь"
                  rows={2}
                  maxLength={240}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy
                ? "Секунду…"
                : login
                  ? "Войти в TELEJKA"
                  : "Создать аккаунт"}
              <ArrowRight size={18} />
            </button>
            <p className="auth-note">
              {login
                ? "Вход сохраняется на этом устройстве."
                : "Без номера телефона. Без лишних формальностей."}
            </p>
          </form>
        </div>
        <footer className="auth-bottom">
          <span>
            Будь собой. Будь на связи. <span className="live-dot" />
          </span>
        </footer>
      </section>
    </main>
  );
}

"use client";
import type { User } from "@/lib/types";
import { BadgeCheck } from "lucide-react";
export function VerifiedBadge({ verified }: { verified?: boolean }) {
  if (!verified) return null;
  return (
    <span
      className="verified-badge"
      role="img"
      aria-label="Подтверждённый аккаунт"
      title="Подтверждённый аккаунт"
    >
      <BadgeCheck size={16} fill="#398ce8" stroke="white" strokeWidth={2} />
    </span>
  );
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("auth/"))
      window.location.assign("/register");
    throw new Error(body.error || "Не удалось выполнить запрос.");
  }
  if (
    (path === "posts" && method === "POST") ||
    (/^posts\/[^/]+$/.test(path) && method === "DELETE")
  ) {
    window.dispatchEvent(new Event("telejka-posts-changed"));
  }
  if (method !== "GET") window.dispatchEvent(new Event("telejka-activity"));
  return body;
}
export function Avatar({
  user,
  size = 44,
}: {
  user: Pick<User, "name" | "avatar" | "color">;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: user.color,
        fontSize: size * 0.4,
      }}
    >
      {user.avatar ? (
        <img src={user.avatar} alt={`Аватар ${user.name}`} />
      ) : (
        user.name.trim().slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
export function Logo() {
  return (
    <a href="/" className="brand" aria-label="TELEJKA — главная">
      <span className="logo-crop">
        <img className="logo-light" src="/telejka-logo.png" alt="" />
        <img className="logo-dark" src="/telejka-logo-white.png" alt="" />
      </span>
      <span>
        telejka<span className="brand-dot">.</span>
      </span>
    </a>
  );
}
export function time(value: string) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Что-то пошло не так.";
}
export async function readAvatar(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Выберите PNG, JPG или WebP.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Изображение должно быть меньше 8 МБ.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const size = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.85);
}

export function UserName({ user }: { user: User }) {
  return (
    <span style={{ color: user.name_color || undefined }}>
      {user.name}
      {user.plus_active && (
        <span
          className="plus-badge"
          role="img"
          aria-label="TELEJKA+"
          title="TELEJKA+"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M6 2v8M2 6h8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <VerifiedBadge verified={user.verified} />
    </span>
  );
}

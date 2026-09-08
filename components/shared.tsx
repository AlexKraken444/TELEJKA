"use client";
import type { User } from "@/lib/types";
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
        <img src="/telejka-logo.png" alt="" />
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

"use client";
import { useState } from "react";
import { api, errorText } from "./shared";
import { fingerprint, type PublicDevice } from "@/lib/crypto-chat";
import type { Chat } from "@/lib/types";
export function ChatKeys({ chat }: { chat: Chat }) {
  const [prints, setPrints] = useState<string[]>([]),
    [error, setError] = useState("");
  return (
    <div>
      <button
        className="text-button"
        onClick={async () => {
          try {
            const keys = await api<PublicDevice[]>(`chats/${chat.id}/keys`);
            setPrints(
              await Promise.all(
                keys.map(
                  async (k) =>
                    `${chat.participants.find((p) => p.id === k.user_id)?.name}: ${await fingerprint(k.public_key)}`,
                ),
              ),
            );
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        Ключи сквозного шифрования
      </button>
      {prints.length > 0 && (
        <div className="security-panel">
          <p>
            Сравните отпечаток с ключом в профиле собеседника по другому каналу
            связи.
          </p>
          {prints.map((p) => (
            <code key={p}>{p}</code>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

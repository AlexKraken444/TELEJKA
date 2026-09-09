"use client";
import { useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { decryptMessage, identityFor } from "@/lib/crypto-chat";
import { MediaList, type Attachment } from "./media";
export function EncryptedMessage({
  message,
  chatId,
  userId,
}: {
  message: Message;
  chatId: string;
  userId: string;
}) {
  const [decoded, setDecoded] = useState<{
      body: string;
      attachments: Attachment[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (message.envelope)
      identityFor(userId)
        .then((i) =>
          decryptMessage<{ body: string; attachments: Attachment[] }>(
            chatId,
            message.envelope!,
            i,
          ),
        )
        .then((data) => {
          if (typeof data.body !== "string" || !Array.isArray(data.attachments))
            throw Error();
          if (alive) setDecoded(data);
        })
        .catch(() => {
          if (alive) setError("Сообщение недоступно на этом устройстве.");
        });
    return () => {
      alive = false;
    };
  }, [message.envelope, chatId, userId]);
  if (!message.envelope) return <p>{message.body}</p>;
  return decoded ? (
    <>
      <p>{decoded.body}</p>
      <MediaList items={decoded.attachments} />
    </>
  ) : (
    <p className="muted">{error || "Расшифровка…"}</p>
  );
}

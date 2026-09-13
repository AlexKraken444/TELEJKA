"use client";
import {EditContent,ShareButton,recipientDevices} from './content-tools';
import {api} from './shared';
import {encryptMessage} from '@/lib/crypto-chat';
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
  const [edited,setEdited]=useState(false);
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
  const content=message.envelope?decoded:{body:message.body,attachments:[]};
  async function save(body:string){if(!content)return;if(!body.trim()&&!content.attachments.length)throw Error('Напишите текст.');const envelope=await encryptMessage(chatId,{...content,body},await recipientDevices(chatId,userId));await api('chats/'+chatId+'/messages/'+message.id,'PATCH',{envelope});setDecoded({...content,body});setEdited(true);}
  const tools=content?<><div className="content-tools">{message.user_id===userId&&<EditContent body={content.body} onSave={save}/>}<ShareButton userId={userId} author={message.author.name} content={content}/></div>{(message.edited_at||edited)&&<small className="edited-label">отредактировано</small>}</>:null;
  if (!message.envelope) return <><p>{edited&&decoded?decoded.body:message.body}</p>{tools}</>;
  return decoded ? (
    <>
      <p>{decoded.body}</p>
      <MediaList items={decoded.attachments} />
      {tools}
    </>
  ) : (
    <p className="muted">{error || "Расшифровка…"}</p>
  );
}

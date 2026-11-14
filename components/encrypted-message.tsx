"use client";
import {RichText} from "./rich-text";
import {EditContent,ShareButton,recipientDevices} from './content-tools';
import {api} from './shared';
import {encryptMessage} from '@/lib/crypto-chat';
import { useEffect, useState } from "react";
import type { Message } from "@/lib/types";
import { decryptMessage, identityFor } from "@/lib/crypto-chat";
import { MediaList, type Attachment } from "./media";
export type MessageReply={id:string;name:string;body:string};
export function EncryptedMessage({
  message,
  chatId,
  userId,
  onReply,
}: {
  message: Message;
  chatId: string;
  userId: string;
  onReply?:(reply:MessageReply)=>void;
}) {
  const [edited,setEdited]=useState(false);
  const [decoded, setDecoded] = useState<{
      reply?:MessageReply;
      body: string;
      attachments: Attachment[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    if (message.envelope)
      identityFor(userId)
        .then((i) =>
          decryptMessage<{ body: string; attachments: Attachment[];reply?:MessageReply }>(
            chatId,
            message.envelope!,
            i,
          ),
        )
        .then((data) => {
          if (typeof data.body !== "string" || !Array.isArray(data.attachments))
            throw Error();
          if(data.reply && (typeof data.reply.id!=="string"||typeof data.reply.name!=="string"||typeof data.reply.body!=="string"))delete data.reply;
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
  const tools=content?<><div className="content-tools">{onReply&&<button type="button" onClick={()=>onReply({id:message.id,name:message.author.name,body:content.body.slice(0,300)||(content.attachments.length?"Вложение":"Сообщение")})}>Ответить</button>}{message.user_id===userId&&<EditContent body={content.body} onSave={save}/>}<ShareButton userId={userId} author={message.author.name} content={content}/></div>{(message.edited_at||edited)&&<small className="edited-label">отредактировано</small>}</>:null;
  if (!message.envelope) return <><p>{<RichText text={edited&&decoded?decoded.body:message.body}/>}</p>{tools}</>;
  return decoded ? (
    <>
      {decoded.reply&&<button type="button" className="message-reply" onClick={()=>document.getElementById("message-"+decoded.reply!.id)?.scrollIntoView({block:"center",behavior:"smooth"})}><strong>{decoded.reply.name}</strong><span>{decoded.reply.body}</span></button>}
      <p>{<RichText text={decoded.body}/>}</p>
      <MediaList items={decoded.attachments} />
      {tools}
    </>
  ) : (
    <p className="muted">{error || "Расшифровка…"}</p>
  );
}

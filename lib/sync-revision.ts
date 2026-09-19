import {db} from './db';
// Fingerprints are calculated in PostgreSQL: idle polling transfers one short
// revision, never message envelopes, avatars or attachment data.
export async function chatListRevision(userId:string){
 const [row]=await db()`SELECT md5(COALESCE(jsonb_agg(r ORDER BY r.id)::text,'')) revision FROM (
 SELECT c.id,c.title,c.is_group,m.hidden_at,m.cleared_at,
 (SELECT max(created_at) FROM messages WHERE conversation_id=c.id) last_message,
 (SELECT count(*) FROM messages WHERE conversation_id=c.id) message_count,
 (SELECT jsonb_agg(telejka_user(cm.user_id,${userId}::uuid) ORDER BY cm.user_id) FROM members cm WHERE cm.conversation_id=c.id) participants
 FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE m.user_id=${userId}) r`;
 return String(row.revision);
}
export async function messageRevision(chatId:string,userId:string){
 const [row]=await db()`SELECT md5(jsonb_build_object(
 'messages',(SELECT jsonb_agg(r ORDER BY r.id) FROM (SELECT m.id,m.edited_at,m.created_at,
 telejka_message_reactions(m.id,${userId}::uuid) reactions,
 (SELECT id FROM polls WHERE message_id=m.id) poll_id
 FROM messages m WHERE m.conversation_id=${chatId} ORDER BY m.created_at DESC,m.id DESC LIMIT 100) r),
 'members',(SELECT jsonb_agg(jsonb_build_object('user',telejka_user(user_id,${userId}::uuid),'cleared',cleared_at) ORDER BY user_id) FROM members WHERE conversation_id=${chatId})
 )::text) revision`;
 return String(row.revision);
}

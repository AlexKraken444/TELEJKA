import {z} from 'zod';
import {db} from './db';
import {FeatureError} from './api-error';
export async function commentGif(value:unknown,userId:string){
 if(value==null)return [];
 const id=z.uuid().parse(value),sql=db();
 const [user]=await sql`SELECT plus_until>now() active FROM users WHERE id=${userId}`;
 if(!user?.active)throw new FeatureError(403,'GIF из коллекции доступны с TELEJKA PLUS.');
 const [gif]=await sql`SELECT u.id,g.title name,u.mime,u.size FROM gif_library g JOIN uploads u ON u.id=g.upload_id WHERE g.upload_id=${id} AND u.ready AND u.published`;
 if(!gif)throw new FeatureError(404,'GIF не найдена.');
 return [gif];
}

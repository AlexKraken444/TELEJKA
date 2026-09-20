import {db} from './db';
export const VERIFICATION_OWNER_ID='5158ea3a-fcb5-44cb-8f29-362b94aa1744';
export async function canManageVerification(userId:string){
 const [owner]=await db()`SELECT user_id FROM telejka_auth.owner_account WHERE singleton=true`;
 return userId===(owner?.user_id||VERIFICATION_OWNER_ID);
}

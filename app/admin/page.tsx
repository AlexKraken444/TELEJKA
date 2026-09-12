import {currentUser} from '@/lib/auth';
import {VERIFICATION_OWNER_ID} from '@/lib/verification';
import {redirect} from 'next/navigation';
import {StudioAdmin} from '@/components/studio';
export const dynamic='force-dynamic';
export default async function Admin(){const user=await currentUser();if(!user)redirect('/register');if(user.id!==VERIFICATION_OWNER_ID)return <main className="studio-page"><h1>Доступ только владельцу TELEJKA</h1><a href="/feed">Вернуться в ленту</a></main>;return <StudioAdmin/>}

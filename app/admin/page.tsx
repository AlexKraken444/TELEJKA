import {currentUser} from '@/lib/auth';

import {redirect} from 'next/navigation';
import {StudioAdmin} from '@/components/studio';
export const dynamic='force-dynamic';
export default async function Admin(){const user=await currentUser();if(!user)redirect('/register');if(!user.can_manage_verification)return <main className="studio-page"><h1>Доступ только владельцу TELEJKA</h1><a href="/feed">Вернуться в ленту</a></main>;return <StudioAdmin/>}

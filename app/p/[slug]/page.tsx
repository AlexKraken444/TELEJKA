import {currentUser} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {CustomStudioPage} from '@/components/studio';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{slug:string}>}){if(!await currentUser())redirect('/register');const {slug}=await params;return <CustomStudioPage slug={slug}/>}

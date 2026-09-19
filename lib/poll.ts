// Each subscription owns its revision; no response data is shared across users.
import {api} from '@/components/shared';
export function revisionPoll<T>(path:string){
 let revision='',cached:T|undefined;
 return async()=>{
  const response=await api<{revision:string;data?:T;unchanged?:boolean}>(path+'?sync=1&revision='+encodeURIComponent(revision));
  revision=response.revision;
  if(!response.unchanged)cached=response.data;
  return cached;
 };
}

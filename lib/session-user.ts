export async function fetchSessionUser(token:string,request:typeof fetch=fetch){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await request('https://1234news.vercel.app/api/telejka/me',{headers:{cookie:`telejka_session=${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
   if(response.status===401)return null;
   if(!response.ok)throw new Error('SESSION_SERVICE_UNAVAILABLE');
   const user=await response.json();
   if(!user||typeof user.id!=='string')throw new Error('SESSION_SERVICE_UNAVAILABLE');
   return user;
  }catch{if(attempt===1)throw new Error('SESSION_SERVICE_UNAVAILABLE');}
 }
 throw new Error('SESSION_SERVICE_UNAVAILABLE');
}

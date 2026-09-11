/* Notifications only: never cache private API responses or chat messages. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{}}catch{}
 const uuid=/^[0-9a-f-]{36}$/i;
 const chatId=uuid.test(data.chatId||'')?data.chatId:null;
 const userId=uuid.test(data.userId||'')?data.userId:null;
 const messageId=uuid.test(data.messageId||'')?data.messageId:'new';
 event.waitUntil(self.registration.showNotification('TELEJKA',{
  body:'Новое сообщение',icon:'/push-icon.png',badge:'/push-badge.png',
  tag:'telejka-'+messageId,renotify:false,data:{chatId,userId},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const {chatId,userId}=event.notification.data||{};
 const destination=new URL('/feed',self.location.origin);
 if(/^[0-9a-f-]{36}$/i.test(chatId||'')&&/^[0-9a-f-]{36}$/i.test(userId||'')){destination.searchParams.set('chat',chatId);destination.searchParams.set('account',userId)}
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(destination.href);return client.focus()}}
  return self.clients.openWindow(destination.href);
 })());
});

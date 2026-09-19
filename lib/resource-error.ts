export function resourceFailure(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 const transfer=/(data\s*transfer|egress|bandwidth).*(quota|limit|exceed)|(quota|limit|exceed).*(data\s*transfer|egress|bandwidth)/i.test(message);
 const quota=transfer||/compute.*(quota|limit)|(quota|limit).*compute|storage.*(quota|limit)/i.test(message);
 return {quota,reason:transfer?'DATA_TRANSFER_QUOTA':quota?'RESOURCE_QUOTA':'TEMPORARY_UNAVAILABLE',error:quota?'Сервис временно недоступен: исчерпан лимит базы данных. Аккаунты и сессии не сбрасываются.':'Сервер временно недоступен. Попробуйте ещё раз.',retryAfter:quota?300:30};
}

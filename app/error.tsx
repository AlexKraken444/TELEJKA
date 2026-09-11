"use client";
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){
 return <main className="session-retry"><h1>Не удалось загрузить TELEJKA</h1><p>Связь с сервером прервалась. Попробуй ещё раз — выход из аккаунта не выполнялся.</p><button className="primary" onClick={()=>reset()}>Повторить</button><button className="text-button" onClick={()=>window.location.reload()}>Обновить страницу</button></main>
}

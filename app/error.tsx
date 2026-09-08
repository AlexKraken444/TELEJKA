"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="full-state">
      <h1>Не удалось загрузить TELEJKA</h1>
      <p>Проверьте подключение и попробуйте ещё раз.</p>
      <button className="primary" onClick={reset}>
        Повторить
      </button>
    </div>
  );
}

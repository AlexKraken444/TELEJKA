import Link from "next/link";
export default function NotFound() {
  return (
    <div className="full-state">
      <h1>Здесь пока ничего нет</h1>
      <Link className="primary" href="/">
        На главную
      </Link>
    </div>
  );
}

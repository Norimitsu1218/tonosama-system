import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "2rem", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>404 - Page Not Found</h1>
      <p>お探しのページは見つかりませんでした。</p>
      <br />
      <Link href="/" style={{ textDecoration: "underline" }}>
        Return to Owner Home
      </Link>
    </div>
  );
}

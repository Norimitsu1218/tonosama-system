export default function HomePage() {
  return (
    <main>
      <section className="card">
        <h1>TONOSAMA OS Guest PWA</h1>
        <p>
          Runtime Guest の入口です。店舗ページは
          <code>/s/[storeId]</code>
          でアクセスします。
        </p>
        <p>
          サンプル確認は
          <code>/s/demo-store?mock=1&amp;lang=ja</code>
          を開くと、画面内の Sample Guide で挙動を段階確認できます。
        </p>
      </section>
    </main>
  );
}

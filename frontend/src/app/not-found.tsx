import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container" style={{ textAlign: "center", padding: "64px 20px" }}>
      <h1 className="page-title">Nothing up here.</h1>
      <p className="muted">This page doesn&apos;t exist, or it&apos;s private.</p>
      <Link href="/" className="btn secondary">Back home</Link>
    </div>
  );
}

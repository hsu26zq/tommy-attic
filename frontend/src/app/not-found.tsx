import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page" style={{ textAlign: "center" }}>
      <h1 className="page-heading">Nothing up here.</h1>
      <p className="muted">This page doesn&apos;t exist, or it&apos;s private.</p>
      <Link href="/" className="btn secondary">Back home</Link>
    </div>
  );
}

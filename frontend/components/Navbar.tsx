"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="p-4 bg-black text-white">
      <div className="flex gap-4">
        <Link href="/">Dashboard</Link>
        <Link href="/deployments">Deployments</Link>
        <Link href="/services/new">Services</Link>
      </div>
    </nav>
  );
}
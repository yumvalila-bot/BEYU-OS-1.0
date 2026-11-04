"use client";

import { useState } from "react";

const links = [
  ["#about", "About"], ["#ecosystem", "Our ecosystem"], ["#governance", "Governance"],
  ["#noelia", "NOELIA AI"], ["#impact", "Our vision"], ["/sign-in", "Sign in to BEYU ↗"],
];

export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  return <div className="ph-mobile-nav" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="public-mobile-menu" onClick={() => setOpen(!open)}><span /><span /></button>
    {open && <nav id="public-mobile-menu" aria-label="Mobile navigation">{links.map(([href, label]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}</nav>}
  </div>;
}

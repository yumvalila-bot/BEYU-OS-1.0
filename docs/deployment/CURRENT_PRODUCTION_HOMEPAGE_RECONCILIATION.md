# Production Homepage Reconciliation

**Inspection date:** 12 November 2026  
**Canonical public host:** `https://www.beyu.co.tz`  
**Vercel project:** `beyu-os-1-0` (`prj_2lwDKNVHO6TUxkLYCA4m7wR5elrj`)

## Observed production state

A direct Vercel lookup by the custom domain resolves `www.beyu.co.tz` to deployment `dpl_6WBRreKYrzULxvAckzPsN8WFZcsd`, ready at:

`beyu-os-1-0-9ii2362nr-yumvalila-1204s-projects.vercel.app`

That deployment was built from commit `f67cf92f19510c56b1a1e5e4ad556710d76a0fd6` on the historical branch `arena/29e84284-beyu-os-1-0`. A direct fetch of the custom domain and that deployment URL returns the same homepage implementation. The apex `beyu.co.tz` redirects to `www.beyu.co.tz` with HTTP 308.

The current `main` production-history record at `dc8f848226ed8860ef293f817fe10394360abb1d` does not contain the live public-home component, stylesheet, mobile navigation component or its `public/home` image assets. Its root page is a different sign-in/home implementation. Therefore, treating the latest `main` deployment record as proof of the currently served custom-domain content would be incorrect.

## Repository reconciliation in this branch

This branch restores the currently served public-home implementation as the public root route, keeps sign-in on the distinct `/sign-in` route, and carries the homepage image assets and responsive regression tests. The current branch's identity, authorization, session, and governance modules remain the source for sign-in and destination authorization; the historical homepage source is not used to replace those modules.

The public site remains a front door, not an authorization boundary. Hostnames select presentation only; access to each Sector OS, Foundation, Family Office and NOELIA surface continues to be determined by server-side authorization.

## Release boundary

This reconciliation changes only the repository branch. It does **not** change the Vercel production alias, project settings, DNS, environment variables, secrets, databases, or production deployment. Do not promote or reassign the production domain until the draft PR, CI evidence, visual comparison and human release review are complete.

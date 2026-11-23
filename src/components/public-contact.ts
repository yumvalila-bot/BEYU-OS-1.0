/**
 * Official institutional public contact details rendered on the BEYU public
 * homepage and public legal/news pages. Kept separate from `src/app/page.tsx`
 * so the canonical entry module never carries domain-like literals alongside
 * its canonical host resolver.
 */
export const OFFICIAL_BEYU_CONTACT = {
  phoneDisplay: "+255615766716",
  phoneSpaced: "+255 615 766 716",
  phoneHref: "tel:+255615766716",
  email: ["info", "beyu.co.tz"].join("@"),
  emailHref: `mailto:${["info", "beyu.co.tz"].join("@")}`,
  country: "Tanzania",
  cityCountry: "Dar es Salaam, Tanzania",
  whatsappHref: "https://wa.me/255615766716",
} as const;

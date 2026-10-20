"use client";

import { useId, useState } from "react";

type Errors = Partial<Record<"name" | "email" | "phone" | "subject" | "message", string>>;
type FormStatus = "idle" | "submitting" | "success" | "error";

function validateEmail(v: string): boolean {
  // RFC5322-lite + international-friendly: no overly restrictive TLD assumption
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
function validatePhone(v: string): boolean {
  if (!v) return true; // optional
  // Allow +, spaces, dashes, parentheses; 7–20 digits after stripping
  const digits = v.replace(/[^0-9]/g, "");
  return digits.length >= 7 && digits.length <= 20 && /^\+?[0-9\s\-()]+$/.test(v.trim());
}

export function ContactForm() {
  const nameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const subjectId = useId();
  const messageId = useId();
  const errorId = useId();
  const successId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<FormStatus>("idle");
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const validate = (): Errors => {
    const e: Errors = {};
    const n = name.trim();
    if (!n) e.name = "Name is required.";
    else if (n.length < 2) e.name = "Name must be at least 2 characters.";
    else if (n.length > 120) e.name = "Name must be under 120 characters.";

    const em = email.trim();
    if (!em) e.email = "Email is required.";
    else if (!validateEmail(em)) e.email = "Enter a valid email address.";
    else if (em.length > 200) e.email = "Email must be under 200 characters.";

    if (phone && !validatePhone(phone)) e.phone = "Enter a valid phone number (7–20 digits, may include +, spaces, dashes).";

    if (subject && subject.length > 200) e.subject = "Subject must be under 200 characters.";

    const m = message.trim();
    if (!m) e.message = "Message is required.";
    else if (m.length < 10) e.message = "Message must be at least 10 characters.";
    else if (m.length > 5000) e.message = "Message must be under 5000 characters.";

    return e;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setServerMessage(null);
      return;
    }
    setStatus("submitting");
    setServerMessage(null);
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, subject: subject.trim() || undefined, message: message.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message || body?.message || "Could not send message. Please try again.";
        setStatus("error");
        setServerMessage(msg);
        // Field-level if validation
        if (body?.error?.details) {
          const fe: Errors = {};
          for (const d of body.error.details as Array<{ path: string[]; message: string }>) {
            const field = d.path[0] as keyof Errors;
            if (field) fe[field] = d.message;
          }
          if (Object.keys(fe).length) setErrors(fe);
        }
        return;
      }
      setStatus("success");
      setServerMessage(body?.data?.message || "Message received. We will respond shortly.");
      // Preserve success, clear sensitive? Keep data for user reference but disable double submit briefly
      setMessage("");
    } catch {
      setStatus("error");
      setServerMessage("Network error. Please check your connection and try again.");
    }
  };

  const busy = status === "submitting";

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={serverMessage ? errorId : undefined} className="space-y-4">
      {serverMessage && status === "success" && (
        <div id={successId} role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-800">
          {serverMessage}
        </div>
      )}
      {serverMessage && status === "error" && (
        <div id={errorId} role="alert" aria-live="assertive" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-800">
          {serverMessage}
        </div>
      )}

      <div>
        <label htmlFor={nameId} className="text-[12px] font-semibold text-[#0B1F4D]">
          Full name <span aria-hidden="true" className="text-rose-600">*</span>
        </label>
        <input
          id={nameId}
          name="name"
          autoComplete="name"
          required
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${nameId}-err` : undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          className="mt-1 w-full rounded-lg border border-[#0B1F4D]/15 px-3 py-2.5 text-[13px] outline-none focus:border-[#0B1F4D] focus:ring-2 focus:ring-[#0B1F4D]/15"
        />
        {errors.name && <p id={`${nameId}-err`} role="alert" className="mt-1 text-[11px] text-rose-600">{errors.name}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={emailId} className="text-[12px] font-semibold text-[#0B1F4D]">
            Email <span aria-hidden="true" className="text-rose-600">*</span>
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-required="true"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? `${emailId}-err` : "email-help"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="mt-1 w-full rounded-lg border border-[#0B1F4D]/15 px-3 py-2.5 text-[13px] outline-none focus:border-[#0B1F4D] focus:ring-2 focus:ring-[#0B1F4D]/15"
          />
          {!errors.email && <p id="email-help" className="mt-1 text-[11px] beyu-muted">We use this only to reply.</p>}
          {errors.email && <p id={`${emailId}-err`} role="alert" className="mt-1 text-[11px] text-rose-600">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor={phoneId} className="text-[12px] font-semibold text-[#0B1F4D]">
            Phone <span className="font-normal text-[#5b6b85]">(optional)</span>
          </label>
          <input
            id={phoneId}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? `${phoneId}-err` : "phone-help"}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+255 700 000 000"
            className="mt-1 w-full rounded-lg border border-[#0B1F4D]/15 px-3 py-2.5 text-[13px] outline-none focus:border-[#0B1F4D] focus:ring-2 focus:ring-[#0B1F4D]/15"
          />
          {!errors.phone && <p id="phone-help" className="mt-1 text-[11px] beyu-muted">International format accepted.</p>}
          {errors.phone && <p id={`${phoneId}-err`} role="alert" className="mt-1 text-[11px] text-rose-600">{errors.phone}</p>}
        </div>
      </div>

      <div>
        <label htmlFor={subjectId} className="text-[12px] font-semibold text-[#0B1F4D]">
          Subject <span className="font-normal text-[#5b6b85]">(optional)</span>
        </label>
        <input
          id={subjectId}
          name="subject"
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? `${subjectId}-err` : undefined}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="How can we help?"
          className="mt-1 w-full rounded-lg border border-[#0B1F4D]/15 px-3 py-2.5 text-[13px] outline-none focus:border-[#0B1F4D] focus:ring-2 focus:ring-[#0B1F4D]/15"
        />
        {errors.subject && <p id={`${subjectId}-err`} role="alert" className="mt-1 text-[11px] text-rose-600">{errors.subject}</p>}
      </div>

      <div>
        <label htmlFor={messageId} className="text-[12px] font-semibold text-[#0B1F4D]">
          Message <span aria-hidden="true" className="text-rose-600">*</span>
        </label>
        <textarea
          id={messageId}
          name="message"
          required
          aria-required="true"
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? `${messageId}-err` : "message-help"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Describe your inquiry…"
          className="mt-1 w-full rounded-lg border border-[#0B1F4D]/15 px-3 py-2.5 text-[13px] outline-none focus:border-[#0B1F4D] focus:ring-2 focus:ring-[#0B1F4D]/15"
        />
        {!errors.message && <p id="message-help" className="mt-1 text-[11px] beyu-muted">10–5000 characters. No sensitive credentials.</p>}
        {errors.message && <p id={`${messageId}-err`} role="alert" className="mt-1 text-[11px] text-rose-600">{errors.message}</p>}
      </div>

      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#0B1F4D] px-5 text-[13px] font-semibold text-white hover:bg-[#16294a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B1F4D] disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Sending…" : "Send message"}
      </button>

      <p className="text-[11px] beyu-muted">
        By sending, you agree we may store this inquiry to respond. We do not share it beyond BEYU OS operations.
      </p>
    </form>
  );
}

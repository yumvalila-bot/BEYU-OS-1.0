/** Uniform, non-disclosing Foundation page denial. */
export function FoundationDenied() {
  return (
    <section className="beyu-panel mx-auto max-w-2xl px-6 py-8" aria-labelledby="foundation-denied-title">
      <h1 id="foundation-denied-title" className="text-xl font-semibold">Authorisation denied</h1>
      <p className="mt-3 text-sm beyu-muted">You do not have the required access to this area.</p>
      <a className="mt-5 inline-block underline focus-visible:outline-2 focus-visible:outline-offset-4" href="/launcher">
        Return to your available destinations
      </a>
    </section>
  );
}

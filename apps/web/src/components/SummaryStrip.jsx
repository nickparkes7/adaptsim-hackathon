export function SummaryStrip() {
  return (
    <section className="summary-strip" aria-label="Selected profile summary">
      <article>
        <span>Country</span>
        <strong id="summary-country">--</strong>
      </article>
      <article>
        <span>Forces</span>
        <strong id="summary-forces">--</strong>
      </article>
      <article>
        <span>Hardware</span>
        <strong id="summary-hardware">--</strong>
      </article>
      <article>
        <span>Snapshots</span>
        <strong id="summary-snapshots">0</strong>
      </article>
    </section>
  );
}

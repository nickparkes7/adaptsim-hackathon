export function OutputPanels() {
  return (
    <details id="workspace-output" className="workspace-output-disclosure" aria-label="Detailed output panels">
      <summary className="workspace-output-summary" aria-label="Toggle detailed output panels" title="Toggle lower panels">
        <span className="workspace-output-toggle" aria-hidden="true">
          <span className="output-open">+</span>
          <span className="output-close">-</span>
        </span>
      </summary>

      <section className="content-grid">
        <section className="panel span-8">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Generated Snapshot</p>
              <h2 id="snapshot-title">Select a Location</h2>
            </div>
          </div>
          <div id="snapshot-detail" className="detail-grid empty-state">
            <p>No snapshot has been generated yet.</p>
          </div>
        </section>

        <section className="panel span-4 snapshot-queue-panel" aria-label="Saved snapshot queue">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Snapshot Queue</p>
              <h2>Search History</h2>
            </div>
          </div>
          <div id="snapshot-table" className="snapshot-list" role="list" aria-label="Saved snapshots"></div>
        </section>

        <section className="panel span-12">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Extractable Model</p>
              <h2>Model Field Coverage</h2>
            </div>
          </div>
          <div id="model-fields" className="model-fields"></div>
        </section>
      </section>
    </details>
  );
}

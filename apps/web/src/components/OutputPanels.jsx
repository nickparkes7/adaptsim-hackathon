export function OutputPanels() {
  return (
    <details id="workspace-output" className="workspace-output-disclosure" aria-label="Detailed output panels">
      <summary className="workspace-output-summary" aria-label="Toggle detailed output panels" title="Toggle lower panels">
        <span className="workspace-output-toggle" aria-hidden="true"></span>
      </summary>

      <section className="content-grid">
        <section className="panel span-8">
          <div className="panel-heading">
            <div>
              <h2 id="snapshot-title">Snapshot</h2>
            </div>
          </div>
          <div id="snapshot-detail" className="detail-grid empty-state">
            <p>No snapshot has been generated yet.</p>
          </div>
        </section>

        <section className="panel span-4 snapshot-queue-panel" aria-label="Saved snapshot queue">
          <div className="panel-heading">
            <div>
              <h2>History</h2>
            </div>
          </div>
          <div id="snapshot-table" className="snapshot-list" role="list" aria-label="Saved snapshots"></div>
        </section>

        <section className="panel span-12">
          <div className="panel-heading">
            <div>
              <h2>Model</h2>
            </div>
          </div>
          <div id="model-fields" className="model-fields"></div>
        </section>
      </section>
    </details>
  );
}

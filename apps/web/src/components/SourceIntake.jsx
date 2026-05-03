export function SourceIntake() {
  return (
    <section className="workflow-stage source-intake-stage" data-step="01" aria-labelledby="source-intake-title">
      <div className="stage-heading">
        <div>
          <p className="eyebrow">Source Intake</p>
          <h2 id="source-intake-title">Drop Files</h2>
        </div>
        <div className="source-heading-actions">
          <span id="source-file-count" className="count-pill">
            0 attached
          </span>
          <button id="clear-workflow" className="quiet-button source-clear-button" type="button">
            Clear
          </button>
        </div>
      </div>

      <label id="source-dropzone" className="source-dropzone" htmlFor="source-file-input">
        <input
          id="source-file-input"
          name="source-files"
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <span className="dropzone-mark" aria-hidden="true">
          +
        </span>
        <span className="dropzone-copy">
          <strong>Drop photos, reports, maps, or spreadsheets</strong>
          <small>Files stay local; resolved coordinates may query map and public-source services.</small>
        </span>
      </label>
      <div id="source-agent-status" className="source-agent-status" aria-live="polite"></div>
      <div id="source-file-list" className="source-file-list" aria-live="polite"></div>
    </section>
  );
}

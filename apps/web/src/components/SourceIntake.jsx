function handleTitlePointerMove(event) {
  const title = event.currentTarget;
  const rect = title.getBoundingClientRect();
  const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);

  title.style.setProperty("--metal-x", `${(x * 100).toFixed(1)}%`);
  title.style.setProperty("--metal-y", `${(y * 100).toFixed(1)}%`);
  title.style.setProperty("--metal-tilt-x", `${((0.5 - y) * 4).toFixed(2)}deg`);
  title.style.setProperty("--metal-tilt-y", `${((x - 0.5) * 6).toFixed(2)}deg`);
}

function handleTitlePointerLeave(event) {
  const title = event.currentTarget;

  title.style.setProperty("--metal-x", "50%");
  title.style.setProperty("--metal-y", "45%");
  title.style.setProperty("--metal-tilt-x", "0deg");
  title.style.setProperty("--metal-tilt-y", "0deg");
}

export function SourceIntake() {
  return (
    <section
      id="workflow-page-01"
      className="workflow-stage workflow-page source-intake-stage"
      data-step="01"
      data-workflow-page="01"
      data-page-active="true"
      aria-labelledby="source-intake-title"
      aria-hidden="false"
      tabIndex={-1}
    >
      <div className="stage-heading">
        <div>
          <h2
            id="source-intake-title"
            className="metallic-title"
            data-text="Adapt Sim"
            onPointerMove={handleTitlePointerMove}
            onPointerLeave={handleTitlePointerLeave}
          >
            Adapt Sim
          </h2>
        </div>
        <div className="source-heading-actions">
          <span id="source-file-count" className="source-file-count">
            0 attached
          </span>
        </div>
      </div>

      <div className="source-dropzone-shell">
        <label id="source-dropzone" className="source-dropzone" htmlFor="source-file-input">
          <input
            id="source-file-input"
            name="source-files"
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          />
          <span className="dropzone-mark" aria-hidden="true">
            +
          </span>
          <span className="dropzone-copy">
            <strong>Drop Photos / Files</strong>
            <small>Multiple geotagged photos map individually in Step 02.</small>
          </span>
        </label>
        <div className="source-clear-row">
          <button id="clear-workflow" className="quiet-button source-clear-button" type="button" aria-label="Clear source intake and workflow">
            Clear
          </button>
        </div>
      </div>
      <div id="source-agent-status" className="source-agent-status" aria-live="polite"></div>
      <div id="source-file-list" className="source-file-list" aria-live="polite"></div>
    </section>
  );
}

export function ControlRail() {
  return (
    <aside className="control-rail" aria-label="Location and snapshot controls">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <span>Adapt</span>
          <strong>Sim</strong>
        </div>
      </div>

      <section className="panel workflow-panel minimized-workflow-step compact-location-panel" data-step="03">
        <div className="panel-heading compact-step-heading">
          <div>
            <p className="eyebrow">Location</p>
            <h2>Generate Snapshot</h2>
          </div>
          <div className="step-heading-actions">
            <button id="use-coordinates" className="primary-button confirm-button" type="button" aria-label="Confirm selected location">
              Confirm
            </button>
            <button id="clear-snapshots" className="quiet-button" type="button" aria-label="Clear snapshots and location inputs" disabled>
              Clear
            </button>
          </div>
        </div>

        <label className="field">
          <span>City, state, province, region, or country</span>
          <input
            id="location-search"
            name="location-search"
            type="search"
            autoComplete="off"
            role="combobox"
            placeholder="Search Tokyo, Norfolk, or Kenya…"
            aria-controls="search-results"
            aria-expanded="false"
            aria-autocomplete="list"
          />
        </label>
        <div id="search-results" className="search-results" role="listbox"></div>

        <div className="coord-grid">
          <label className="field">
            <span>Latitude</span>
            <input
              id="lat-input"
              name="latitude"
              type="number"
              min="-90"
              max="90"
              step="0.000001"
              inputMode="decimal"
              autoComplete="off"
              placeholder="35.676200"
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              id="lon-input"
              name="longitude"
              type="number"
              min="-180"
              max="180"
              step="0.000001"
              inputMode="decimal"
              autoComplete="off"
              placeholder="139.650300"
            />
          </label>
        </div>
      </section>

      <section className="panel workflow-panel final-check-panel" data-step="04">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Final Check</p>
            <h2>Asset Database Launch</h2>
          </div>
        </div>
        <label className="field">
          <span>Analyst note</span>
          <textarea
            id="analyst-note"
            name="analyst-note"
            rows="6"
            maxLength="1200"
            autoComplete="off"
            placeholder="Add simulation-priority context…"
          ></textarea>
        </label>
        <button id="reason-note" className="primary-button full-width" type="button" disabled>
          Start Asset Database
        </button>
        <div id="reasoning-output" className="reasoning-output" aria-live="polite"></div>
      </section>
    </aside>
  );
}

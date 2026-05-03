export function MapStage() {
  return (
    <section className="workflow-stage map-stage-shell" data-step="02" aria-labelledby="global-map-title">
      <div className="stage-heading">
        <div>
          <p className="eyebrow">Global Map</p>
          <h2 id="global-map-title">Geospatial View</h2>
        </div>
      </div>

      <div className="map-source-inline" aria-label="Map source controls">
        <div className="map-source-inline-head">
          <div>
            <p className="eyebrow">Map Source</p>
            <strong>High-Fidelity Globe</strong>
          </div>
          <span id="map-source-pill" className="count-pill">
            Cesium
          </span>
        </div>
        <div className="map-source-controls">
          <label className="field">
            <span>Provider</span>
            <div className="provider-row">
              <select id="map-provider" name="map-provider"></select>
              <button id="add-map-provider" className="quiet-button add-provider-button" type="button" aria-expanded="false">
                Add Source
              </button>
            </div>
          </label>
          <button id="apply-map-source" className="primary-button" type="button">
            Apply Source
          </button>
          <button id="confirm-map-step" className="primary-button confirm-button map-confirm-button" type="button">
            Confirm
          </button>
        </div>
        <div id="custom-map-source" className="custom-map-source" hidden>
          <label className="field">
            <span>Source name</span>
            <input
              id="custom-provider-name"
              name="custom-provider-name"
              type="text"
              maxLength="80"
              autoComplete="off"
              placeholder="Team imagery service"
            />
          </label>
          <label className="field">
            <span>Source type</span>
            <select id="custom-provider-type" name="custom-provider-type">
              <option value="raster">Raster tile URL template</option>
              <option value="arcgis">ArcGIS MapServer URL</option>
              <option value="3dtiles">3D Tiles URL</option>
            </select>
          </label>
          <label className="field">
            <span>URL</span>
            <input
              id="custom-provider-url"
              name="custom-provider-url"
              type="url"
              autoComplete="off"
              spellCheck="false"
              placeholder="https://tiles.example.com/{z}/{x}/{y}.png"
            />
          </label>
          <div className="button-row">
            <button id="save-custom-provider" className="primary-button" type="button">
              Save Source
            </button>
            <button id="cancel-custom-provider" className="quiet-button" type="button">
              Cancel
            </button>
          </div>
        </div>
        <p id="map-source-status" className="map-source-status" aria-live="polite"></p>
      </div>

      <section className="globe-stage" aria-label="Interactive globe">
        <div id="earth-canvas" aria-label="Interactive geospatial globe for selecting a location"></div>
        <div className="globe-overlay top-left">
          <p id="selected-location-title" className="eyebrow">
            Location
          </p>
          <h2 id="selected-place">No location selected</h2>
          <p id="selected-coordinates">Awaiting geospatial input.</p>
        </div>
        <div className="globe-overlay top-right map-tools" aria-label="Map controls">
          <button id="center-selected" className="overlay-button" type="button" title="Center selected location">
            Center
          </button>
          <button id="zoom-in-map" className="overlay-button icon-button" type="button" aria-label="Zoom in" title="Zoom in">
            +
          </button>
          <button
            id="zoom-out-map"
            className="overlay-button icon-button"
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
          >
            -
          </button>
        </div>
        <div id="country-hover" className="country-hover" hidden></div>
        <div id="public-site-hover" className="site-hover" hidden></div>
        <div className="globe-overlay bottom-left">
          <div className="status-stack">
            <span id="resolution-status" className="status-pill neutral" aria-live="polite">
              Awaiting input
            </span>
            <span id="data-boundary" className="status-pill">
              Country-level public baseline
            </span>
          </div>
        </div>
        <div id="site-legend" className="site-legend" hidden>
          <p>Public reference sites + history</p>
          <div id="site-legend-items"></div>
          <small>Wikipedia-linked context, historical events, not live posture.</small>
        </div>
        <div id="map-scale" className="map-scale" aria-label="Map distance scale" aria-live="polite">
          <div className="scale-values">
            <span id="scale-metric">--</span>
            <span id="scale-feet">--</span>
          </div>
          <div className="scale-track">
            <span id="scale-bar"></span>
          </div>
        </div>
      </section>
    </section>
  );
}

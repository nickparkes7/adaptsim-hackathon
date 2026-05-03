import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Input } from "./ui/input";

export function MapStage({ children }) {
  return (
    <section
      id="workflow-page-02"
      className="workflow-stage workflow-page map-stage-shell minimized-workflow-step"
      data-step="02"
      data-workflow-page="02"
      aria-labelledby="global-map-title"
      aria-hidden="true"
      tabIndex={-1}
    >
      <div className="stage-heading compact-step-heading">
        <div>
          <h2 id="global-map-title">Scene</h2>
        </div>
        <div className="step-heading-actions">
          <Button id="confirm-map-step" className="primary-button confirm-button map-confirm-button" type="button">
            Confirm
          </Button>
        </div>
      </div>

      <div id="map-readiness-status" className="map-readiness-status" role="status" aria-live="polite">
        <div className="map-readiness-head">
          <span id="map-readiness-label">Location readiness</span>
          <strong id="map-readiness-percent">0%</strong>
        </div>
        <div
          id="map-readiness-progress"
          className="map-readiness-progress"
          role="progressbar"
          aria-label="Step 02 location readiness"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <span id="map-readiness-bar"></span>
        </div>
        <p id="map-readiness-detail">Waiting for Step 01 source intake.</p>
      </div>

      <Collapsible className="map-source-inline" aria-label="Map source controls">
        <CollapsibleTrigger asChild>
          <Button className="map-source-inline-head" variant="outline" type="button">
            <span>Map source</span>
            <span id="map-source-pill" className="count-pill">
              Cesium
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="map-source-inline-body" forceMount>
          <div className="map-source-controls">
            <label className="field">
              <span>Provider</span>
              <div className="provider-row">
                <select id="map-provider" name="map-provider" aria-label="Map imagery provider"></select>
                <Button id="add-map-provider" className="quiet-button add-provider-button" variant="outline" type="button" aria-expanded="false">
                  Add
                </Button>
              </div>
            </label>
            <Button id="apply-map-source" className="primary-button" type="button">
              Apply
            </Button>
          </div>
          <div id="custom-map-source" className="custom-map-source" hidden>
            <label className="field">
              <span>Source name</span>
              <Input
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
              <Input
                id="custom-provider-url"
                name="custom-provider-url"
                type="url"
                autoComplete="off"
                spellCheck="false"
                placeholder="https://tiles.example.com/{z}/{x}/{y}.png"
              />
            </label>
            <div className="button-row">
              <Button id="save-custom-provider" className="primary-button" type="button">
                Save
              </Button>
              <Button id="cancel-custom-provider" className="quiet-button" variant="outline" type="button">
                Cancel
              </Button>
            </div>
          </div>
          <p id="map-source-status" className="map-source-status" aria-live="polite"></p>
        </CollapsibleContent>
      </Collapsible>

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
          <Button id="center-selected" className="overlay-button" variant="outline" type="button" title="Center selected location">
            Center
          </Button>
          <Button id="zoom-in-map" className="overlay-button icon-button" variant="outline" type="button" aria-label="Zoom in" title="Zoom in">
            +
          </Button>
          <Button
            id="zoom-out-map"
            className="overlay-button icon-button"
            variant="outline"
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
          >
            -
          </Button>
        </div>
        <div id="country-hover" className="country-hover" hidden></div>
        <div id="public-site-hover" className="site-hover" hidden></div>
        <div id="source-photo-hover" className="site-hover source-photo-hover" hidden></div>
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
      {children && <div className="scene-support-stack">{children}</div>}
    </section>
  );
}

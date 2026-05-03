import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export function LocationStep() {
  return (
    <section className="panel workflow-panel minimized-workflow-step compact-location-panel" data-step="03">
      <div className="panel-heading compact-step-heading">
        <div>
          <h2>Location</h2>
        </div>
      </div>

      <label className="field">
        <span>Confirm or adjust</span>
        <Input
          id="location-search"
          name="location-search"
          type="search"
          autoComplete="off"
          role="combobox"
          placeholder="Confirm the Scene location"
          aria-controls="search-results"
          aria-expanded="false"
          aria-autocomplete="list"
        />
      </label>
      <div id="search-results" className="search-results" role="listbox"></div>

      <div className="coord-grid">
        <label className="field">
          <span>Latitude</span>
          <Input
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
          <Input
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
  );
}

export function FinalCheckStep({ embedded = false, step = "04", title = "Operation Context" } = {}) {
  return (
    <section
      id={embedded ? undefined : "workflow-page-04"}
      className={`panel workflow-panel final-check-panel${embedded ? " embedded-final-check-panel" : " workflow-page"}`}
      data-step={step}
      data-workflow-page={embedded ? undefined : step}
      aria-hidden={embedded ? undefined : "true"}
      tabIndex={embedded ? undefined : -1}
    >
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      <label className="field">
        <span>Mission context</span>
        <Textarea
          id="analyst-note"
          name="analyst-note"
          rows="6"
          maxLength="1200"
          autoComplete="off"
          placeholder="Objective, route, trainee role, expected decisions, constraints, required threats, assets to avoid, timing, terrain notes..."
        />
      </label>
      <div id="reasoning-output" className="reasoning-output" aria-live="polite"></div>
    </section>
  );
}

export function ControlRail() {
  return (
    <>
      <LocationStep />
      <FinalCheckStep />
    </>
  );
}

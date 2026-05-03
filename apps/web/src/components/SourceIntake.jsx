import { Upload } from "lucide-react";

import { Button } from "./ui/button";

export function SourceIntake({ children }) {
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
          <h2 id="source-intake-title" className="metallic-title">
            Source
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
          <Upload className="dropzone-mark" aria-hidden="true" />
          <span className="dropzone-copy">
            <strong>Drop source files</strong>
            <small>Photos, video, documents</small>
          </span>
        </label>
        <div className="source-clear-row">
          <Button id="clear-workflow" className="quiet-button source-clear-button" variant="outline" type="button" aria-label="Clear source intake and workflow">
            Clear
          </Button>
        </div>
        <div id="source-selection-preview" className="source-selection-preview" hidden aria-live="polite"></div>
        <div id="source-agent-status" className="source-agent-status" aria-live="polite"></div>
        <div id="source-file-list" className="source-file-list" aria-live="polite"></div>
        {children && <div className="source-support-stack">{children}</div>}
      </div>
    </section>
  );
}

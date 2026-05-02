#!/usr/bin/env bash
set -euo pipefail

gcloud compute ssh --zone "us-east1-b" "a100-instance-02" --tunnel-through-iap --project "gecko-dev-fde"

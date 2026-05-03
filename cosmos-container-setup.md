# Cosmos Container Setup Notes

Status: legacy reference only. The updated hackathon brief now centers the short-term demo on RealityScan plus Unreal Engine, with Cosmos Reason2, Transfer2.5, Predict2.5, and Gaussian-splat runtime paths deferred. Keep these notes only for future model experiments, not for the current MVP path.

Local status on this Mac:

- Hugging Face CLI installed: `hf version`
- NGC CLI installed at: `./ngc-cli/ngc`
- Docker CLI installed: `docker --version`
- Docker daemon is not running until Docker Desktop is installed and started.
- NVIDIA GPU tooling is not available on this Mac: `nvidia-smi` is expected to fail here.

## Hugging Face Login

Create a Hugging Face access token with read access, then run:

```bash
hf auth login
hf auth whoami
```

For Cosmos checkpoints hosted on Hugging Face, accept NVIDIA's model license on the relevant model page before downloading.

## NGC Login

Create an NVIDIA NGC API key, then test the local NGC CLI:

```bash
./ngc-cli/ngc --version
./ngc-cli/ngc config set
```

When Docker is available on a Linux NVIDIA GPU host:

```bash
export NGC_API_KEY="<your-ngc-api-key>"
echo "$NGC_API_KEY" | docker login nvcr.io --username '$oauthtoken' --password-stdin
```

## Docker Desktop On This Mac

Homebrew could not finish installing Docker Desktop because macOS required an interactive sudo password. Run this directly in Terminal:

```bash
brew install --cask docker
open -a Docker
docker info
```

Docker Desktop on Apple Silicon is useful for general Docker work, but it does not provide the NVIDIA GPU runtime needed to run Cosmos GPU containers locally.

## Cosmos NIM Container On A GPU Host

Run this on a Linux machine with an NVIDIA GPU, NVIDIA drivers, Docker, and NVIDIA Container Toolkit:

```bash
export NGC_API_KEY="<your-ngc-api-key>"
export CONTAINER_NAME=cosmos-transfer2-5-2b
export IMG_NAME=nvcr.io/nim/nvidia/cosmos-transfer2-5-2b:1.0.0
export LOCAL_NIM_CACHE="$HOME/.cache/nim"

mkdir -p "$LOCAL_NIM_CACHE"
echo "$NGC_API_KEY" | docker login nvcr.io --username '$oauthtoken' --password-stdin
docker pull "$IMG_NAME"

docker run -it --rm --name="$CONTAINER_NAME" \
  --runtime=nvidia \
  --gpus all \
  --shm-size=32GB \
  --ulimit nofile=65536:65536 \
  -e NGC_API_KEY="$NGC_API_KEY" \
  -v "$LOCAL_NIM_CACHE:/opt/nim/.cache" \
  -p 8000:8000 \
  "$IMG_NAME"
```

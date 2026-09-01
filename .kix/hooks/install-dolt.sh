#!/usr/bin/env bash
# Ensure the dolt CLI is available. No-op if dolt is already on PATH;
# otherwise download a pinned release from GitHub into ~/.local/bin so that
# remote/cloud Claude Code sessions can run beads (bd), which depends on dolt.
#
# Override the version with KIX_DOLT_VERSION=<x.y.z>.
set -euo pipefail

command -v dolt >/dev/null 2>&1 && exit 0

version="${KIX_DOLT_VERSION:-2.0.0}"

case "$(uname -s)" in
  Linux)  os=linux ;;
  Darwin) os=darwin ;;
  *) printf 'install-dolt: skipped (unsupported OS: %s)\n' "$(uname -s)" >&2; exit 0 ;;
esac

case "$(uname -m)" in
  x86_64|amd64)  arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) printf 'install-dolt: skipped (unsupported arch: %s)\n' "$(uname -m)" >&2; exit 0 ;;
esac

bin_dir="${HOME}/.local/bin"
mkdir -p "$bin_dir"

tarball="dolt-${os}-${arch}.tar.gz"
url="https://github.com/dolthub/dolt/releases/download/v${version}/${tarball}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if ! curl -fsSL "$url" -o "${tmpdir}/${tarball}"; then
  printf 'install-dolt: download failed: %s\n' "$url" >&2
  exit 1
fi

if ! tar -xzf "${tmpdir}/${tarball}" -C "$tmpdir"; then
  printf 'install-dolt: extract failed: %s\n' "$tarball" >&2
  exit 1
fi

dolt_bin="${tmpdir}/dolt-${os}-${arch}/bin/dolt"
if [ ! -x "$dolt_bin" ]; then
  printf 'install-dolt: dolt binary missing from %s\n' "$tarball" >&2
  exit 1
fi

install -m 0755 "$dolt_bin" "${bin_dir}/dolt"

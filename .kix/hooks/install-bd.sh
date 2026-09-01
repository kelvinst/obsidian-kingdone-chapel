#!/usr/bin/env bash
# Ensure the bd (beads) CLI is available. No-op if bd is already on PATH;
# otherwise download a pinned release from GitHub into ~/.local/bin so that
# remote/cloud Claude Code sessions can run beads commands.
#
# Override the version with KIX_BD_VERSION=<x.y.z>.
set -euo pipefail

command -v bd >/dev/null 2>&1 && exit 0

version="${KIX_BD_VERSION:-1.0.3}"

case "$(uname -s)" in
  Linux)  os=linux ;;
  Darwin) os=darwin ;;
  *) printf 'install-bd: skipped (unsupported OS: %s)\n' "$(uname -s)" >&2; exit 0 ;;
esac

case "$(uname -m)" in
  x86_64|amd64)  arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) printf 'install-bd: skipped (unsupported arch: %s)\n' "$(uname -m)" >&2; exit 0 ;;
esac

bin_dir="${HOME}/.local/bin"
mkdir -p "$bin_dir"

tarball="beads_${version}_${os}_${arch}.tar.gz"
url="https://github.com/steveyegge/beads/releases/download/v${version}/${tarball}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if ! curl -fsSL "$url" -o "${tmpdir}/${tarball}"; then
  printf 'install-bd: download failed: %s\n' "$url" >&2
  exit 1
fi

if ! tar -xzf "${tmpdir}/${tarball}" -C "$tmpdir"; then
  printf 'install-bd: extract failed: %s\n' "$tarball" >&2
  exit 1
fi

if [ ! -x "${tmpdir}/bd" ]; then
  printf 'install-bd: bd binary missing from %s\n' "$tarball" >&2
  exit 1
fi

install -m 0755 "${tmpdir}/bd" "${bin_dir}/bd"

# Changelog

Notable changes to h5p-cli-creator are documented here.

## Unreleased

### Added

- Automatically retrieve supported custom H5P packages from pinned GitHub Releases while preserving the H5P Hub fallback for official libraries.
- Validate downloads structurally, verify custom packages with pinned SHA-256 checksums, cache packages safely, and reuse valid cached packages for offline operation.
- Cover package acquisition with deterministic regression tests and real-network smoke tests. CI passes on Windows and Ubuntu with Node.js 22 and 24.

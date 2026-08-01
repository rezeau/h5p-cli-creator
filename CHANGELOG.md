# Changelog

Notable changes to h5p-cli-creator are documented here.

## 0.4.3 - 2026-08-01

### Changed

- Upgrade the bundled and pinned `H5P.GuessIt` package from 1.7.1 to 1.8.0.
- Keep the existing GuessIt CSV format, CLI arguments, creator options, and generated content defaults unchanged.

### Fixed

- Validate registered custom cache packages against their configured machine name, complete major/minor/patch version, and SHA-256 checksum, including concurrent cache publication.
- Preserve stale or mismatched custom cache files and report explicit remove-and-retry guidance while leaving official H5P Hub cache behaviour unchanged.

### Deferred

- CLI options for learner item-count selection and requiring guesses to be in the configured word list remain planned for a later feature.

## 0.4.2 - 2026-07-30

### Fixed

- Upgrade the cached and pinned `H5P.GuessIt` package from 1.7.0 to 1.7.1, correcting the invalid ZIP directory entry in the previous release asset.
- Reject H5P source packages containing explicit ZIP directory entries before they are used or cached.

## 0.4.1 - 2026-07-29

### Added

- Automatically retrieve supported custom H5P packages from pinned GitHub Releases while preserving the H5P Hub fallback for official libraries.
- Validate downloads structurally, verify custom packages with pinned SHA-256 checksums, cache packages safely, and reuse valid cached packages for offline operation.
- Cover package acquisition with deterministic regression tests and real-network smoke tests. CI passes on Windows and Ubuntu with Node.js 22 and 24.

### Changed

- Upgrade the cached and pinned `H5P.GuessIt` package from 1.6.0 to 1.7.0.

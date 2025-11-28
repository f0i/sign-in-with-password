# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of IC Password Auth library
- Password-based authentication using Argon2id key derivation
- Delegation identity support for Internet Computer
- Automatic session persistence with localStorage
- Idle detection with configurable auto-logout (10 minutes default)
- Session restoration on page reload
- Configurable storage adapters (localStorage, sessionStorage, custom)
- TypeScript support with full type definitions
- Built with @icp-sdk/core for modern IC development

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- Client-side Argon2id key derivation
- Delegation identities prevent offline brute-force attacks
- Automatic session expiration after 30 minutes
- Privacy-focused idle detection

## [1.0.0] - TBD

Initial release.

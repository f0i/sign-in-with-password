# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2025-11-29

### Added
- npm package publishing with OIDC Trusted Publishers
- IC-hosted version with integrity hash for CDN usage
- Feedback form link in documentation
- MIT License file
- Comprehensive release documentation (QUICK_RELEASE.md, RELEASING.md)
- Documentation for deterministic builds

### Changed
- Installation options now prioritize npm package installation
- Updated all documentation to use correct git remote name
- Release workflow now publishes to npm automatically via OIDC

## [0.1.0] - 2025-11-29

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
- GitHub Actions CI/CD workflow
- Automated GitHub Releases

### Security
- Client-side Argon2id key derivation
- Delegation identities prevent offline brute-force attacks
- Automatic session expiration after 30 minutes
- Privacy-focused idle detection

## [0.0.1] - 2025-11-29

Initial npm package placeholder for configuring Trusted Publishers.

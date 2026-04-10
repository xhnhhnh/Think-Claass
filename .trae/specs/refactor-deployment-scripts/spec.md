# Refactor Deployment Scripts Spec

## Why
The current deployment scripts (`install.sh`, `update.sh`, `pack.sh`) are functional but lack robust error handling, pre-flight checks, and fallback mechanisms. In a diverse range of server environments (Ubuntu, CentOS, Debian), unexpected issues like missing dependencies, port conflicts, or network failures during GitHub API calls can cause the scripts to fail ungracefully. Refactoring these scripts will ensure a smoother, more reliable deployment and update experience for end users.

## What Changes
- **install.sh**: 
  - Add OS detection and appropriate package manager usage.
  - Add pre-flight checks (disk space, port availability, memory).
  - Use `jq` (if available) or robust parsing for GitHub API responses.
  - Improve Node.js and PM2 installation logic.
  - Add firewall configuration (ufw/firewalld) for the selected ports.
  - Add robust error handling and cleanup on failure.
- **update.sh**:
  - Enhance the backup mechanism (compress backups, auto-clean old backups).
  - Add a rollback mechanism if the update or service restart fails.
  - Add pre-update checks (disk space, service status).
- **pack.sh**:
  - Add checks to ensure `npm run build` succeeds before proceeding.
  - Add validation of the generated zip file.

## Impact
- Affected specs: Deployment and Update processes.
- Affected code: `install.sh`, `update.sh`, `pack.sh`, `.tmp/deploy/deploy.sh`, `.tmp/deploy/update.sh`.

## ADDED Requirements
### Requirement: Robust Pre-flight Checks
The system SHALL verify that the target server has sufficient resources (disk space, memory) and that required ports are available before proceeding with installation or updates.

#### Scenario: Success case
- **WHEN** user runs `install.sh`
- **THEN** the script checks for port 80 and the application port, verifies disk space, and proceeds only if checks pass.

### Requirement: Update Rollback Mechanism
The system SHALL provide a way to automatically or manually roll back to the previous version if an update fails to start the service.

#### Scenario: Success case
- **WHEN** user runs `update.sh` and the new version fails to start via PM2
- **THEN** the script restores the `database.sqlite` and files from the backup created at the start of the script, and restarts the old service.

## MODIFIED Requirements
### Requirement: GitHub API Parsing
The scripts SHALL use robust methods to extract the download URL from the GitHub Releases API, handling rate limits and network errors gracefully.

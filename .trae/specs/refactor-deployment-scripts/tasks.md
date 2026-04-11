# Tasks

- [x] Task 1: Add robust pre-flight checks and error handling to `install.sh`
  - [x] Check if running as root or with sudo privileges.
  - [x] Add OS detection (Ubuntu/Debian, CentOS/RHEL) to use correct package managers.
  - [x] Check for available disk space (e.g., minimum 1GB).
  - [x] Check if required ports (80 for Nginx, and the app PORT) are already in use.
  - [x] Improve Node.js and PM2 installation logic (e.g., checking minimum required versions).

- [x] Task 2: Enhance GitHub Release parsing in deployment scripts
  - [x] Update `install.sh` and `update.sh` to use robust URL extraction for GitHub Releases.
  - [x] Handle GitHub API rate limits gracefully, providing clear error messages or fallbacks.

- [x] Task 3: Improve backup and add rollback mechanism in `update.sh`
  - [x] Backup the entire application directory and database before updating.
  - [x] Compress backups to save disk space.
  - [x] Implement an automatic rollback feature if the `pm2 restart` fails after the update.

- [x] Task 4: Enhance `pack.sh` and synchronization
  - [x] Add strict error checking to `pack.sh` to ensure `npm run build` succeeds.
  - [x] Synchronize changes from the root `update.sh` and `install.sh` to the `.tmp/deploy/` directory to ensure packaged deployments use the new scripts.

- [x] Task 5: Commit and push changes to GitHub
  - [x] Add modified scripts to Git.
  - [x] Create a commit message explaining the robust script refactoring.
  - [x] Push the changes to the `main` branch.

# Task Dependencies
- Task 2 depends on Task 1.
- Task 3 depends on Task 2.
- Task 4 depends on Tasks 1, 2, and 3.
- Task 5 depends on all previous tasks.

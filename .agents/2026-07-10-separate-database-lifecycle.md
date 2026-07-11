# Database Lifecycle Separation

- `start_backend.ps1` now only prepares Python, verifies dependencies, reads configuration, checks database connectivity, checks port 8000, and starts Uvicorn.
- `start_database.ps1` now reports registered MySQL/MariaDB services and starts them only with an explicit `-Start` flag.
- Added a Docker Compose MySQL option and changed example credentials away from passwordless root access.
- Startup scripts no longer create project-local MySQL data, run `mysqld.exe`, repair InnoDB files, or terminate port processes.

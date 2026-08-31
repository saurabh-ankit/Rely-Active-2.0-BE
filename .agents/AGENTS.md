# Project Guidelines for Database & Migrations

- **No Scratch Scripts**: Do not create temporary scripts in a `scratch/` directory for database changes or data updates.
- **Schema & Column Changes**: Always generate official Sequelize migration files in `src/migrations/` (e.g. `YYYYMMDDHHMMSS-description.ts`).
- **Data Updates**: Always provide explicit raw SQL queries to the user for manual data updates rather than running one-off scratch scripts.

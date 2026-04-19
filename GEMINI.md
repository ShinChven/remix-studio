- Read what's in ./design folder for specific job.
- all delete actions should have confirmation.
- the app listens to port 3000.
- `./agent` folder provide knowledge for agents to understand the system.

## I18n Maintenance
- Use `npx tsx scripts/compare-i18n.ts` to check for missing translation keys across all locales.
- **When to use**: After adding new features, changing UI text, or adding new keys to `src/locales/en.json`.
- **Workflow**:
  1. Add new keys to `src/locales/en.json`.
  2. Run the comparison script.
  3. Fill in the missing keys in other language files (`fr.json`, `ja.json`, `ko.json`, `zh-CN.json`, `zh-TW.json`).

## Database Migrations
- **ALWAYS PREPARE FOR MIGRATION**: When modifying `schema.prisma` or adding database fields, you must always provide or generate the corresponding Prisma migration files to ensure online instances and production environments can migrate successfully smoothly.

- Read what's in ./design folder for specific job.
- all delete actions should have confirmation.
- the app listens to port 3000.
- `./agent` folder provide knowledge for agents to understand the system.

## I18n Maintenance
- Use `npm run i18n:check` or `npx tsx scripts/compare-i18n.ts` to check for missing translation keys across all locales.
- **When to use**: After adding new features, changing UI text, or adding new keys under `src/locales/en/`.
- **Workflow**:
  1. Add new keys to the relevant chunk in `src/locales/en/`.
  2. Run the comparison script.
  3. Fill in the missing keys in the matching chunk under other locale directories (`fr/`, `ja/`, `ko/`, `zh-CN/`, `zh-TW/`).

## Database Migrations
- **ALWAYS PREPARE FOR MIGRATION**: When modifying `schema.prisma` or adding database fields, you must always provide or generate the corresponding Prisma migration files to ensure online instances and production environments can migrate successfully smoothly.

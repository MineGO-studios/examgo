# ExamGO

ExamGO by MineGO Studio helps Iraqi Grade 6 English teachers prepare student papers and matching editable Word answer keys from reusable question banks.

**Current development version: 1.0.0-alpha.1 — Alpha 1.** This is an Alpha development checkpoint, not a stable release or proof that teacher testing has passed. Package metadata identifies this checkout; it does not identify an already deployed build.

## Documentation

Start with the [official documentation](docs/README.md).

- [Teacher guide](docs/guides/teacher-guide.md)
- [Development setup](docs/guides/development.md)
- [System and compatibility reference](docs/reference/system-overview.md)
- [Alpha limitations](docs/reference/alpha-limitations.md)
- [Versioning and documentation policy](docs/maintenance/documentation-and-versioning.md)
- [Change history](CHANGELOG.md)

The [Linear project](https://linear.app/minego/project/examgo-496f93ecf2e7) owns work status, priorities and phase acceptance. Repository documentation owns product instructions and technical reference. Older design and phase records remain dated evidence.

## Local development

Use Node.js 24, matching the current CI configuration, and npm.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local`.
3. Set the authorized development project's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Run `npm run dev` and open the local address it prints.

Use a browser-safe publishable key. Never put a service-role key or database password in client configuration. Local environment files stay outside version control. Installing dependencies and starting locally do not apply migrations or authorize access to another environment.

## Project checks

```text
npm test
npm run lint
npm run build
npm run typecheck:e2e
npm run test:e2e
```

Run the checks relevant to the change. Browser tests need the configured browser runtime. Structural document checks and browser tests do not replace human inspection of changed documents in Word or LibreOffice.

## Release path

The planned progression is Alpha, Beta, optional release candidates, then the first stable `1.0.0`. Promotions require documented evidence and owner approval. Phase numbers and document-schema versions remain separate from product versions.

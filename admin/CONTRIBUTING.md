# Contributing

Thank you for helping improve Ziru Dashboard.

## Branches and pull requests

- Repository work should target the `main` branch.
- Do not include private infrastructure identifiers, private deployment
  commands, local artifacts, or secrets in a pull request.

## Local workflow

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill in local values.
3. Run `pnpm dev` for development.
4. Before opening a pull request, run `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build`.

## Code style

- Use TypeScript with explicit types for exported functions and non-obvious values.
- Keep files and directories in kebab-case.
- Prefer small, intention-revealing functions and immutable data.
- Validate data at boundaries and keep API/data-access logic separated from UI code.
- Use existing local patterns before adding new abstractions.

## Pull request expectations

- Describe user-visible behavior changes and deployment or environment changes.
- Include the validation commands you ran.
- Call out any open DevOps decisions, especially image publishing and runtime environment injection.

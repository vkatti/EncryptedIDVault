# Branch Strategy

## Long-lived branches
- `main`: always production-ready and releasable.

## Working branches
- `feature/<short-name>`: normal implementation work.
- `fix/<short-name>`: bug fixes found during development.
- `chore/<short-name>`: tooling, docs, and maintenance.

## Rules
- Create one branch per focused change.
- Keep branches short-lived and merge them back through pull requests or reviewable patches.
- Rebase feature branches onto `main` before merge when practical.
- Avoid a long-lived `develop` branch unless the workflow clearly needs one.

## Initial implementation workflow
1. Start each task from `main`.
2. Create a focused `feature/*` branch.
3. Keep commits small and reviewable.
4. Merge back to `main` when the task is complete and validated.

## Suggested naming examples
- `feature/local-vault-core`
- `feature/entry-crud-ui`
- `feature/drive-sync`
- `fix/content-script-targeting`
- `chore/test-harness`

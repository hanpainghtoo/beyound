# Commit and Branch Guidelines

Commit and branch naming rules for this repo. Also mirrored in `AGENTS.md`;
keep both in sync.

## Branch prefixes

| Prefix    | When to use                             |
|-----------|-----------------------------------------|
| feat/     | new feature or functionality            |
| fix/      | bug fix                                 |
| refactor/ | code restructuring, no behavior change  |
| ui/       | UI-specific updates                     |
| docs/     | documentation only                      |
| chore/    | tooling, config, dependencies           |
| test/     | adding/updating tests                   |

- Branch names: `<prefix>/<kebab-case-summary>` (lowercase, hyphens).
- Create with: `git checkout -b <prefix>/<kebab-case-summary>`.
- Examples from this repo: `feat/plan-module-configuration`, `fix/telegram-integration-bugs`, `ui/channels`.

## Commit prefixes

| Prefix     | When to use                                    |
|------------|------------------------------------------------|
| [add]      | Introduce something new                        |
| [update]   | Improve or extend existing functionality       |
| [fix]      | Fix a bug or incorrect behavior                |
| [remove]   | Delete code, feature, or unused files          |
| [refactor] | Internal code cleanup without behavior changes |
| [docs]     | Documentation only                             |
| [ui]       | UI-specific updates                            |
| [merge]    | Merge commits                                  |

### Merge commits

Use the pattern: `[merge] from <src-branch> to <target-branch>`

Examples:
- `[merge] from development to main`
- `[merge] from ui/channels to development`

### Drift normalization

History contains older prefixes that are NO LONGER allowed. Map them:

| Legacy          | Use instead |
|-----------------|-------------|
| [modify]        | [update]    |
| [ui fix]        | [ui]        |
| [ui]            | [ui]        |
| feat: ...       | [add] ...   |
| fix: ...        | [fix] ...   |

Never output `[modify]`, `[ui fix]`, or bare conventional prefixes like `feat:` / `fix:`.

## Message rules

- Format: `<prefix> [<scope>:]<short summary>` where `<scope>` is an optional
  domain (e.g. `telegram`, `payment`, `channels`, `plan`).
- Imperative, present tense, lowercase after the prefix.
- Keep under ~72 characters.
- No trailing period.
- Examples:
  - `[add] customer loyalty API`
  - `[update] invoice calculation logic`
  - `[fix] telegram: webhook 404 handling`
  - `[remove] legacy payment service`
  - `[refactor] extract user service methods`
  - `[docs] update API setup guide`
  - `[ui] channel icons`
  - `[merge] from development to main`

## Hygiene rules

- Stage ONLY intentional files; never `git add .` blindly.
- Never commit secrets, keys, or `.env` files.
- Match the existing commit style in the repo.
- Never force-push to shared branches.
- One logical change per commit.
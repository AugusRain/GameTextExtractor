# AGENTS.md

## Project Rules

- Use Conventional Commits for every commit, for example `feat: add scan api`.
- After changing code, run the automated test suite with `npm test`.
- When the change is complete and tests pass, create a git commit automatically.
- After completion, send a Bark notification by running `npm run notify`.

## Bark Notification

- Configure Bark with `BARK_URL` as a full push URL.
- If `BARK_URL` is missing, notification must not fail the task. Print `Bark 未配置，已跳过通知`.

## MVP Scope

- Extract likely front-end visible text from a provided game folder.
- Output translation batches as JSON files with no more than 300 items each.
- Do not write translated text back into the source game folder in this MVP.

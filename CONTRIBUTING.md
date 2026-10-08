# Contributing to Gua for Web

Gua for Web is a fork of [Element Web](https://github.com/element-hq/element-web). Upstream's [developer guide](developer_guide.md), [code style](code_style.md) and [review guidelines](docs/review.md) still apply to the codebase. This guide covers what is specific to Gua.

Upstream's CLA, Localazy and pull request instructions do not apply here. There is no CLA, and pull requests go to `Gua-ra/gua-web`.

## Where the Gua code lives

- `src/gua/`: resolver routing, OIDC phone login, Gua configuration and settings.
- `src/identity/`: the client for the Gua identity service.
- `src/components/structures/auth/`: the phone, one-time code, profile and PIN onboarding screens.

Keep Gua changes in these places where you can. It keeps upstream merges small.

## Setup

See the README's [Quick start](README.md#quick-start).

## Before opening a pull request

```bash
yarn lint     # types, eslint, prettier, stylelint, workflows
yarn test     # Jest
```

- New code comes with unit tests. End-to-end tests (`yarn test:playwright`) cover user-facing flows.
- A new Gua file starts with `Copyright <year> Gua` followed by the SPDX line the existing Gua files carry (see `src/gua/config.ts`). A modified upstream file keeps its upstream notice.

## Pull requests

Branch from `gua/main`. Commits, pull request text and writing follow the [org contribution guide](https://github.com/Gua-ra/.github/blob/main/CONTRIBUTING.md#pull-requests).

## Reporting problems

- Issues are turned off on this repository. Report problems through the [support form](https://gua.global/support) or [support@gua.global](mailto:support@gua.global).
- Security problems: [SECURITY.md](SECURITY.md).

## Upstream

`develop` tracks upstream and is not an integration branch. See the README's [Upstream relationship](README.md#upstream-relationship).

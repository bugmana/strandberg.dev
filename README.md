# strandberg.dev

Personal website at [strandberg.dev](https://strandberg.dev), built with Jekyll, HTML, CSS, and browser JavaScript. The landing page and interactive world use Three.js loaded from a CDN.

## Structure

- `index.html`: landing page.
- `world/`: interactive world.
- `resume/`: resume pages.
- `privacy/`: privacy pages, including `privacy/shelllite/index.md`.
- `_layouts/`: shared Jekyll layouts.
- `assets/css/`, `assets/js/`, and `assets/`: styles, scripts, and media.
- `_config.yml`: site metadata and SEO/sitemap plugins.
- `CNAME`: GitHub Pages custom domain.

## Local development

Install Ruby and Bundler, then run:

```bash
bundle install
bundle exec jekyll serve
```

Open `http://localhost:4000`. Use `bundle exec jekyll build` to check production output in `_site/`. Generated output, local Bundler configuration, and dependencies are ignored by Git.

Keep page metadata in Jekyll front matter and reuse the layouts and CSS tokens. Preserve resume print styles when changing its presentation.

## Deployment

GitHub Pages builds and deploys the root of `main` when changes are pushed to [bugmana/strandberg.dev](https://github.com/bugmana/strandberg.dev). The `pages-build-deployment` workflow records the result. There is no separate npm build step.

```bash
gh run list --repo bugmana/strandberg.dev
gh run watch <run-id> --repo bugmana/strandberg.dev
```

## ShellLite

[ShellLite](https://github.com/bugmana/ShellLite) is a separate Flutter project, checked out alongside this repository at `../ShellLite`. Its web app runs at [shell.strandberg.dev](https://shell.strandberg.dev).

This repository publishes the [ShellLite privacy policy](https://strandberg.dev/privacy/shelllite/); it does not build or host the Flutter app. Changes pushed here do not deploy `shell.strandberg.dev`. ShellLite's GitHub Actions workflow releases Android/iOS artifacts and uploads to Google Play internal testing; its web app is rebuilt separately on the web host. See the [ShellLite README](https://github.com/bugmana/ShellLite#releases-and-web-deployment) for release, deployment, and browser-check commands.

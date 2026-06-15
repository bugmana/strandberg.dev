---
name: eslint-prettier
description: Guidelines for running ESLint and Prettier to check, lint, and format all JavaScript files.
---

# Skill: JavaScript Linting & Formatting (ESLint & Prettier)

This skill provides standard commands and guidelines for verifying code quality, fixing style formatting, and checking for lint issues using Prettier and ESLint.

---

## 🛠 Usage Guide

### 1. Prettier (Formatting)

Prettier is used to enforce a consistent code style (spacing, quotes, line wrapping, etc.).

*   **Check Formatting Status**:
    Run this command to check if all JavaScript files are correctly formatted:
    ```bash
    npx prettier --check "assets/js/**/*.js"
    ```
*   **Auto-Format Files**:
    Run this command to automatically format and write code style fixes to all JavaScript files:
    ```bash
    npx prettier --write "assets/js/**/*.js"
    ```
*   **Format Specific Files**:
    To format a single file:
    ```bash
    npx prettier --write "path/to/file.js"
    ```

### 2. ESLint (Linting & Code Quality)

ESLint is configured via `eslint.config.mjs` to check code safety, unused variables, undefined references, and other logical code bugs.

*   **Run Linter**:
    Run this command to analyze all JavaScript files for lint errors:
    ```bash
    npx eslint "assets/js/**/*.js"
    ```
*   **Auto-Fix Lint Issues**:
    Run this command to automatically fix safe linting errors:
    ```bash
    npx eslint --fix "assets/js/**/*.js"
    ```
*   **Lint Specific Files**:
    To lint a single file:
    ```bash
    npx eslint "path/to/file.js"
    ```

---

## 💡 Best Practices

*   **Pre-Commit Routine**: Always run both Prettier check and ESLint before committing code changes or completing tasks:
    ```bash
    npx prettier --write "assets/js/**/*.js" && npx eslint "assets/js/**/*.js"
    ```
*   **Fix Order**: Always run Prettier *before* ESLint verification to ensure formatting changes do not trigger linting rules or warnings.
*   **Configuration**:
    *   Prettier is configured via `.prettierrc`.
    *   ESLint is configured via `eslint.config.mjs`. Do not modify rules without team consensus.

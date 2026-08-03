# Jobs PDF Email Implementation Plan

> **For agentic workers:** COMPLETE ALL STEPS. Spec: `docs/superpowers/specs/2026-08-03-vn-jobs-pdf-email-design.md`

**Goal:** `POST /telegram/send-jobs` builds one PDF and emails it via SMTP; no Telegram for jobs.

## Task 1: Env + deps

- Add SMTP_* / MAIL_* to `env.ts` + `.env.example`
- `npm i pdfkit nodemailer` + `@types/pdfkit` `@types/nodemailer`

## Task 2: PDF + Email services

- `src/services/jobs-pdf.service.ts` — `buildJobsPdf(articles, meta) => { buffer, fileName }`
- `src/services/email.service.ts` — `sendJobsPdfEmail(...)` via nodemailer
- Unit tests with mocks

## Task 3: Wire sendJobs

- Controller: crawl → PDF → email; remove Telegram for jobs
- Update route tests
- README

## Task 4: Verify

- `npm test` all green

# How The Setup Works

This document explains how candidates should use the Afrikart sandbox repo
and how it relates to the hosted judging sandbox.

## Short version

- This repo is for local development.
- The local repo is not the judging environment.
- Organizers evaluate submissions against a hosted Afrikart sandbox.
- Your app should keep the API base URL configurable.

## Participant flow

1. Read the challenge brief, `README.md`, `API.md`, and the generated API
   docs.
2. Run the mock server locally with Bun if you want a local sandbox during
   development.
3. Build your app against the documented API contract.
4. Keep the API base URL configurable with an environment variable.
5. During judging or live demos, point your app to the hosted sandbox and use
   the credentials assigned by organizers.

## Participant rules

- Do not hardcode `http://localhost:4000`.
- Do not assume the local default credentials will work in judging.
- Do not treat a modified local copy of the mock server as the judging
  environment.
- Treat the hosted sandbox as the source of truth for evaluation.

## What this repo is for

This repo provides:

- a local mock API server
- local OpenAPI and Swagger docs
- sample requests and test data
- predictable sandbox behavior for development

## What the hosted sandbox is for

The hosted sandbox is where evaluation happens:

- submissions are tested against it
- organizers provide the active judging credentials
- the base URL may differ from localhost


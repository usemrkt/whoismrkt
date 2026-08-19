// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/content — Content Studio, moved into the Marketing Hub.
// Renders the exact same StudioPage component businesses used at /create
// (generation, library, brand kit — all untouched) inside the Hub shell.
// Creators still use /create directly; there's no separate implementation
// here to keep in sync — this file is a thin wrapper, not a rebuild.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute } from "@tanstack/react-router";
import { StudioPage } from "./create";

export const Route = createFileRoute("/_authenticated/marketing-hub/content")({
  head: () => ({ meta: [{ title: "Content Studio — Marketing Hub — MRKT" }] }),
  component: () => <StudioPage embedded />,
});

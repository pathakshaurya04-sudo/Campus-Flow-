import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderErrorBoundary } from "./RenderErrorBoundary.jsx";

function BrokenComponent() {
  throw new Error("Render failed");
}

describe("RenderErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a visible fallback when a child fails to render", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <RenderErrorBoundary>
        <BrokenComponent />
      </RenderErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Something went wrong while opening the application.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Reload application" }),
    ).toBeTruthy();
  });
});

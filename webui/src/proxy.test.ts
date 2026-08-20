import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("proxy", () => {
  it("redirects protected routes to /login when no session cookie is present", () => {
    const response = proxy(
      new NextRequest("http://localhost:3001/chat"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/login",
    );
  });

  it("protects search, documents, and settings pages", () => {
    for (const path of ["/search", "/documents", "/settings"]) {
      const response = proxy(new NextRequest(`http://localhost:3001${path}`));
      expect(response.headers.get("location")).toBe(
        "http://localhost:3001/login",
      );
    }
  });

  it("lets the login and forced-change pages through", () => {
    const login = proxy(new NextRequest("http://localhost:3001/login"));
    const force = proxy(
      new NextRequest("http://localhost:3001/force-change-password"),
    );

    expect(login.status).toBe(200);
    expect(force.status).toBe(200);
  });

  it("lets API paths through (auth is enforced by the core API)", () => {
    const response = proxy(
      new NextRequest("http://localhost:3001/api/v1/auth/login", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("lets static assets through", () => {
    const response = proxy(
      new NextRequest("http://localhost:3001/images/ziru/logo-icon.png"),
    );

    expect(response.status).toBe(200);
  });

  it("lets requests through when the ziru_session cookie is present", () => {
    const response = proxy(
      new NextRequest("http://localhost:3001/chat", {
        headers: { cookie: "ziru_session=abc123" },
      }),
    );

    expect(response.status).toBe(200);
  });
});
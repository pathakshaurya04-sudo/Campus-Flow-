import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client.js";
import { AppLayout } from "../components/AppLayout.jsx";
import { ProtectedRoute } from "../components/ProtectedRoute.jsx";
import { LoginPage } from "../pages/LoginPage.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { useAuth } from "./useAuth.js";

function AuthProbe() {
  const { isAuthenticated, login, logout, user } = useAuth();

  return (
    <div>
      <output>{isAuthenticated ? user.role : "signed out"}</output>
      <button
        type="button"
        onClick={() => login("student@example.com", "not-a-real-password")}
      >
        Log in
      </button>
      <button
        type="button"
        onClick={() => apiRequest("/api/departments").catch(() => {})}
      >
        Load departments
      </button>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("frontend authentication integration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("logs in through the API and sends the returned JWT on authenticated calls", async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "test-access-token",
          user: { user_id: "student-id", role: "student" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ departments: [] }));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("student");
    fireEvent.click(screen.getByRole("button", { name: "Load departments" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/login");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      email: "student@example.com",
      password: "not-a-real-password",
    });
    expect(fetch.mock.calls[1][0]).toBe("/api/departments");
    expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBe(
      "Bearer test-access-token",
    );
    expect(fetch.mock.calls[1][1].credentials).toBe("include");
  });

  it("submits the login form to the existing endpoint and routes by the returned role", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({
        access_token: "test-access-token",
        user: { user_id: "student-id", role: "student" },
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/student" element={<p>Student dashboard</p>} />
            <Route path="/teacher" element={<p>Teacher dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "student@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not-a-real-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByText("Student dashboard");
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/login");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      email: "student@example.com",
      password: "not-a-real-password",
      role: "student",
    });
    expect(window.sessionStorage.getItem("dms.accessToken")).toBe(
      "test-access-token",
    );
  });

  it("sends the selected account type but routes using the database response", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({
        access_token: "test-access-token",
        user: { user_id: "teacher-id", role: "teacher" },
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/teacher" element={<p>Teacher dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Teacher Login" }));
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "teacher@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not-a-real-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByText("Teacher dashboard");
    expect(JSON.parse(fetch.mock.calls[0][1].body).role).toBe("teacher");
  });

  it("redirects an authenticated user away from a dashboard for another role", async () => {
    window.sessionStorage.setItem("dms.accessToken", "test-access-token");
    window.sessionStorage.setItem(
      "dms.user",
      JSON.stringify({ user_id: "student-id", role: "student" }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <p>Admin dashboard</p>
                </ProtectedRoute>
              }
            />
            <Route path="/student" element={<p>Student dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await screen.findByText("Student dashboard");
    expect(screen.queryByText("Admin dashboard")).toBeNull();
  });

  it("clears the local session after a protected API request returns 401", async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "test-access-token",
          user: { user_id: "student-id", role: "student" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "Authentication required" }, 401));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("student");
    fireEvent.click(screen.getByRole("button", { name: "Load departments" }));

    await screen.findByText("signed out");
    expect(window.sessionStorage.getItem("dms.accessToken")).toBeNull();
    expect(window.sessionStorage.getItem("dms.user")).toBeNull();
  });

  it("preserves the local session when a protected API request returns 403", async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "test-access-token",
          user: { user_id: "student-id", role: "student" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "Insufficient permissions" }, 403));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("student");
    fireEvent.click(screen.getByRole("button", { name: "Load departments" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("student")).toBeTruthy();
    expect(window.sessionStorage.getItem("dms.accessToken")).toBe(
      "test-access-token",
    );
  });

  it("clears the local token and user on logout", async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "test-access-token",
          user: { user_id: "student-id", role: "student" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("student");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await screen.findByText("signed out");
    expect(window.sessionStorage.getItem("dms.accessToken")).toBeNull();
    expect(window.sessionStorage.getItem("dms.user")).toBeNull();
    expect(fetch.mock.calls[1][0]).toBe("/api/auth/logout");
    expect(fetch.mock.calls[1][1].method).toBe("POST");
    expect(fetch.mock.calls[1][1].credentials).toBe("include");
    expect(fetch.mock.calls[1][1].headers.has("Authorization")).toBe(false);
  });

  it("shows a visible logout action and blocks protected pages after logout", async () => {
    window.sessionStorage.setItem("dms.accessToken", "test-access-token");
    window.sessionStorage.setItem(
      "dms.user",
      JSON.stringify({
        user_id: "student-id",
        full_name: "Test Student",
        role: "student",
      }),
    );
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    function LoginDestination() {
      const navigate = useNavigate();
      return (
        <div>
          <p>Login page</p>
          <button type="button" onClick={() => navigate("/student")}>
            Try protected page
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/student"]}>
          <Routes>
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <AppLayout>
                    <p>Student dashboard</p>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginDestination />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("Student dashboard")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByText("Login page")).toBeTruthy();
    expect(screen.queryByText("Student dashboard")).toBeNull();
    expect(window.sessionStorage.getItem("dms.accessToken")).toBeNull();
    expect(window.sessionStorage.getItem("dms.user")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try protected page" }));
    await waitFor(() => expect(screen.getByText("Login page")).toBeTruthy());
    expect(screen.queryByText("Student dashboard")).toBeNull();
  });
});

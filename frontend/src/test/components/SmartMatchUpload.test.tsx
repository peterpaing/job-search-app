import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SmartMatchPage from "../../app/smart-match/page";

const mocks = vi.hoisted(() => ({
  readResumeFile: vi.fn(),
  clerk: {
    user: { id: "upload-user" },
    session: {
      id: "upload-session",
      getToken: vi.fn(),
    },
  },
}));

vi.mock("../../app/lib/resume-file", () => ({
  readResumeFile: mocks.readResumeFile,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: mocks.clerk.user.id,
    sessionId: mocks.clerk.session.id,
  }),
  useClerk: () => mocks.clerk,
}));

vi.mock("../../app/component/JobCard", () => ({
  default: () => null,
}));

vi.mock("../../app/component/SmartMatchUsage", () => ({
  default: () => null,
}));

vi.mock("../../app/component/SmartMatchChat", () => ({
  default: () => null,
}));

const fetchMock = vi.fn<typeof fetch>();

const resume =
  "Frontend developer with React, TypeScript, and five years of application development.";

const access = {
  premium: true,
  aiEnabled: true,
  dailyLimit: 20,
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

function extractCalls() {
  return fetchMock.mock.calls.filter(([input]) =>
    new URL(String(input)).pathname.endsWith("/extract"),
  );
}

function resumeText() {
  return screen.getByRole("textbox", { name: "Resume text" });
}

function consent() {
  return screen.getByRole("checkbox", {
    name: /I agree to send this text to OpenAI/,
  });
}

function upload(name = "resume.pdf") {
  const file = new File(["test fixture"], name, {
    type: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
  });

  fireEvent.change(screen.getByLabelText("Resume file"), {
    target: { files: [file] },
  });

  return file;
}

async function openPage() {
  const view = render(<SmartMatchPage />);
  await screen.findByRole("textbox", { name: "Resume text" });
  return view;
}

beforeEach(() => {
  mocks.readResumeFile.mockReset();
  mocks.readResumeFile.mockResolvedValue(resume);

  mocks.clerk.user.id = "upload-user";
  mocks.clerk.session.id = "upload-session";
  mocks.clerk.session.getToken.mockReset().mockResolvedValue("test-token");

  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;

    if (path.endsWith("/bootstrap")) {
      return json({
        access,
        profile: null,
        usage: null,
        matches: [],
        searched: 0,
      });
    }

    if (path.endsWith("/access")) {
      return json(access);
    }

    if (path.endsWith("/extract")) {
      return json({
        draft: {
          skills: ["React"],
          roles: ["Frontend Engineer"],
          experience: "mid",
          location: "",
          workMode: "remote",
        },
        cached: false,
        usage: null,
      });
    }

    throw new Error(`Unexpected test request: ${path}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:5000");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SmartMatch resume upload", () => {
  it.each(["resume.pdf", "resume.txt"])(
    "loads %s for review without automatically calling AI",
    async (name) => {
      await openPage();
      const file = upload(name);

      await waitFor(() => {
        expect(resumeText()).toHaveValue(resume);
      });

      expect(mocks.readResumeFile).toHaveBeenCalledWith(
        file,
        expect.any(AbortSignal),
      );

      expect(consent()).not.toBeChecked();
      expect(
        screen.getByRole("button", { name: "Extract with AI" }),
      ).toBeDisabled();
      expect(extractCalls()).toHaveLength(0);
    },
  );

  it("requires fresh consent after editing loaded text", async () => {
    await openPage();
    upload();

    await waitFor(() => {
      expect(resumeText()).toHaveValue(resume);
    });

    fireEvent.click(consent());

    expect(
      screen.getByRole("button", { name: "Extract with AI" }),
    ).toBeEnabled();

    fireEvent.change(resumeText(), {
      target: { value: `${resume} Updated skills.` },
    });

    expect(consent()).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Extract with AI" }),
    ).toBeDisabled();
    expect(extractCalls()).toHaveLength(0);
  });

  it("resets consent when another file is selected", async () => {
    await openPage();

    fireEvent.change(resumeText(), { target: { value: resume } });
    fireEvent.click(consent());
    expect(consent()).toBeChecked();

    upload();

    await waitFor(() => {
      expect(resumeText()).toHaveValue(resume);
      expect(consent()).not.toBeChecked();
    });

    expect(extractCalls()).toHaveLength(0);
  });

  it("preserves existing text when file reading fails", async () => {
    mocks.readResumeFile.mockRejectedValue(
      new Error("This file does not appear to be a valid PDF."),
    );

    await openPage();

    fireEvent.change(resumeText(), { target: { value: resume } });
    fireEvent.click(consent());
    upload();

    await screen.findByText("This file does not appear to be a valid PDF.");

    expect(resumeText()).toHaveValue(resume);
    expect(consent()).not.toBeChecked();
    expect(extractCalls()).toHaveLength(0);
  });

  it("sends only reviewed text after explicit consent and extraction", async () => {
    await openPage();
    upload();

    await waitFor(() => {
      expect(resumeText()).toHaveValue(resume);
    });

    const reviewed = `${resume} This is my reviewed version.`;

    fireEvent.change(resumeText(), { target: { value: reviewed } });
    fireEvent.click(consent());
    fireEvent.click(screen.getByRole("button", { name: "Extract with AI" }));

    await waitFor(() => {
      expect(extractCalls()).toHaveLength(1);
    });

    const [, options] = extractCalls()[0];

    expect(options?.method).toBe("POST");
    expect(options?.headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      resumeText: reviewed,
      consent: true,
    });

    await waitFor(() => {
      expect(resumeText()).toHaveValue("");
      expect(consent()).not.toBeChecked();
    });
  });

  it("disables upload controls while reading and cancels on unmount", async () => {
    let finish!: (text: string) => void;

    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });

    mocks.readResumeFile.mockReturnValue(pending);

    const view = await openPage();
    upload();

    expect(screen.getByLabelText("Resume file")).toBeDisabled();
    expect(resumeText()).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Upload resume (.txt or .pdf)",
      }),
    ).toBeDisabled();

    const signal = mocks.readResumeFile.mock.calls[0][1] as AbortSignal;

    view.unmount();
    expect(signal.aborted).toBe(true);

    await act(async () => {
      finish(resume);
      await pending;
    });

    expect(extractCalls()).toHaveLength(0);
  });

  it("does not show the previous account's pending resume after switching", async () => {
    let finish!: (text: string) => void;

    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });

    mocks.readResumeFile.mockReturnValue(pending);

    const view = await openPage();
    upload();

    const signal = mocks.readResumeFile.mock.calls[0][1] as AbortSignal;

    mocks.clerk.user.id = "second-user";
    mocks.clerk.session.id = "second-session";

    view.rerender(<SmartMatchPage />);

    await screen.findByRole("textbox", { name: "Resume text" });
    expect(signal.aborted).toBe(true);

    await act(async () => {
      finish(resume);
      await pending;
    });

    expect(resumeText()).toHaveValue("");
    expect(extractCalls()).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readResumeFile } from "../../app/lib/resume-file";

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  destroyWorker: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: mocks.getDocument,
  PDFWorker: class {
    static create() {
      return new this();
    }

    destroy = mocks.destroyWorker;
  },
}));

class TestWorker extends EventTarget {
  static instances: TestWorker[] = [];
  terminate = vi.fn();

  constructor() {
    super();
    TestWorker.instances.push(this);
  }
}

function makeFile(
  name: string,
  content: string | Uint8Array,
  size?: number,
): File {
  const source =
    typeof content === "string" ? new TextEncoder().encode(content) : content;

  // Copy into a regular ArrayBuffer suitable for File/Blob.
  const buffer = new ArrayBuffer(source.byteLength);
  new Uint8Array(buffer).set(source);

  const file = new File([buffer], name);

  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => buffer.slice(0)),
  });

  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }

  return file;
}

function read(file: File) {
  return readResumeFile(file, new AbortController().signal);
}

function configurePdf(
  text = "Frontend developer experienced in React and TypeScript applications.",
  numPages = 1,
) {
  const reader = {
    read: vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: { items: [{ str: text, hasEOL: true }] },
      })
      .mockResolvedValue({ done: true }),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };

  const page = {
    streamTextContent: vi.fn(() => ({
      getReader: () => reader,
    })),
    cleanup: vi.fn(),
  };

  const document = {
    numPages,
    getPage: vi.fn().mockResolvedValue(page),
  };

  const task: {
    promise: Promise<typeof document>;
    destroy: ReturnType<typeof vi.fn>;
    onPassword?: () => void;
  } = {
    promise: Promise.resolve(document),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  mocks.getDocument.mockReturnValue(task);

  return { task, document, page, reader };
}

beforeEach(() => {
  mocks.getDocument.mockReset();
  mocks.destroyWorker.mockReset();
  TestWorker.instances = [];
  vi.stubGlobal("Worker", TestWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("readResumeFile", () => {
  it("reads TXT and normalizes line endings and null characters", async () => {
    await expect(
      read(makeFile("RESUME.TXT", "  React\r\nTypeScript\u0000\rNode.js  ")),
    ).resolves.toBe("React\nTypeScript\nNode.js");

    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["resume.docx", "content", undefined, /Upload a .txt or .pdf/],
    ["resume.txt", "", undefined, /file is empty/],
    ["resume.txt", " ", undefined, /text file is empty/],
    ["resume.txt", "text", 64_001, /64 KB/],
    ["resume.pdf", "%PDF-", 2 * 1024 * 1024 + 1, /2 MB/],
    ["resume.txt", "x".repeat(16_001), undefined, /16,000 characters/],
    ["resume.pdf", "not a PDF", undefined, /valid PDF/],
    ["resume.txt", "%PDF-1.7", undefined, /\.pdf extension/],
  ])("rejects invalid input: %s (%s)", async (name, content, size, message) => {
    await expect(read(makeFile(name, content, size))).rejects.toThrow(message);

    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 without exposing decoder details", async () => {
    await expect(
      read(makeFile("resume.txt", new Uint8Array([0xc3, 0x28]))),
    ).rejects.toThrow("Couldn’t read this file.");
  });

  it("extracts PDF text and cleans up its resources", async () => {
    const pdf = configurePdf();

    await expect(read(makeFile("resume.pdf", "%PDF-1.7"))).resolves.toBe(
      "Frontend developer experienced in React and TypeScript applications.",
    );

    expect(mocks.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Uint8Array),
        enableXfa: false,
        useWorkerFetch: false,
      }),
    );

    expect(pdf.reader.cancel).toHaveBeenCalledOnce();
    expect(pdf.reader.releaseLock).toHaveBeenCalledOnce();
    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    expect(pdf.task.destroy).toHaveBeenCalledOnce();
    expect(mocks.destroyWorker).toHaveBeenCalledOnce();
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("rejects PDFs exceeding the page limit before reading pages", async () => {
    const pdf = configurePdf("text", 11);

    await expect(read(makeFile("resume.pdf", "%PDF-1.7"))).rejects.toThrow(
      "no more than 10 pages",
    );

    expect(pdf.document.getPage).not.toHaveBeenCalled();
    expect(pdf.task.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    ["", /No selectable text/],
    ["React", /Too little text/],
    ["x".repeat(16_001), /16,000 characters/],
  ])("rejects unusable PDF text", async (text, message) => {
    const pdf = configurePdf(text);

    await expect(read(makeFile("resume.pdf", "%PDF-1.7"))).rejects.toThrow(
      message,
    );

    expect(pdf.page.cleanup).toHaveBeenCalledOnce();
    expect(pdf.task.destroy).toHaveBeenCalledOnce();
  });

  it("reports unavailable browser workers", async () => {
    vi.stubGlobal("Worker", undefined);

    await expect(read(makeFile("resume.pdf", "%PDF-1.7"))).rejects.toThrow(
      "unavailable in this browser",
    );
  });

  it("does not begin reading when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    const file = makeFile("resume.txt", "React developer");

    await expect(readResumeFile(file, controller.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );

    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("cancels an active PDF read and destroys the worker", async () => {
    const pdf = configurePdf();
    pdf.task.promise = new Promise(() => undefined);

    const controller = new AbortController();
    const result = readResumeFile(
      makeFile("resume.pdf", "%PDF-1.7"),
      controller.signal,
    );

    const assertion = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });

    await vi.waitFor(() => {
      expect(mocks.getDocument).toHaveBeenCalledOnce();
    });

    controller.abort();
    await assertion;

    expect(pdf.task.destroy).toHaveBeenCalledOnce();
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("rejects password-protected PDFs", async () => {
    const pdf = configurePdf();
    pdf.task.promise = new Promise(() => undefined);

    const result = read(makeFile("resume.pdf", "%PDF-1.7"));
    const assertion = expect(result).rejects.toThrow("Password-protected PDFs");

    await vi.waitFor(() => {
      expect(pdf.task.onPassword).toBeTypeOf("function");
    });

    pdf.task.onPassword?.();
    await assertion;

    expect(pdf.task.destroy).toHaveBeenCalledOnce();
  });

  it("reports worker startup errors", async () => {
    const pdf = configurePdf();
    pdf.task.promise = new Promise(() => undefined);

    const result = read(makeFile("resume.pdf", "%PDF-1.7"));
    const assertion = expect(result).rejects.toThrow(
      "PDF reader couldn’t start",
    );

    await vi.waitFor(() => {
      expect(mocks.getDocument).toHaveBeenCalledOnce();
    });

    TestWorker.instances[0].dispatchEvent(new Event("error"));
    await assertion;

    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("times out stalled PDF reads and cleans up", async () => {
    vi.useFakeTimers();

    const pdf = configurePdf();
    pdf.task.promise = new Promise(() => undefined);

    const result = read(makeFile("resume.pdf", "%PDF-1.7"));
    const assertion = expect(result).rejects.toThrow("took too long");

    await vi.waitFor(() => {
      expect(mocks.getDocument).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;

    expect(pdf.task.destroy).toHaveBeenCalledOnce();
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("replaces internal parser errors with a safe message", async () => {
    const pdf = configurePdf();

    pdf.document.getPage.mockRejectedValue(
      new Error("Internal parser details and private document contents"),
    );

    await expect(read(makeFile("resume.pdf", "%PDF-1.7"))).rejects.toThrow(
      "Couldn’t read this file. Try another file or paste the resume text.",
    );

    expect(pdf.task.destroy).toHaveBeenCalledOnce();
  });
});

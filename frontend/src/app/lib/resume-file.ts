import type { PDFDocumentLoadingTask, PDFWorker } from "pdfjs-dist";

const MAX_TEXT_BYTES = 64_000;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_TEXT_CHARACTERS = 16_000;
const READ_TIMEOUT_MS = 15_000;

class ResumeFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeFileError";
  }
}

export async function readResumeFile(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isText = name.endsWith(".txt");

  if (!isPdf && !isText) {
    throw new ResumeFileError("Upload a .txt or .pdf resume.");
  }

  if (file.size === 0) {
    throw new ResumeFileError("This file is empty.");
  }

  if (isPdf && file.size > MAX_PDF_BYTES) {
    throw new ResumeFileError("Upload a PDF no larger than 2 MB.");
  }

  if (isText && file.size > MAX_TEXT_BYTES) {
    throw new ResumeFileError("Upload a text file no larger than 64 KB.");
  }

  let loadingTask: PDFDocumentLoadingTask | undefined;
  let pdfWorker: PDFWorker | undefined;
  let workerPort: Worker | undefined;
  let stopError: Error | undefined;
  let cleanedUp = false;

  function cleanup() {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;

    if (loadingTask) {
      void loadingTask.destroy().catch(() => undefined);
    }

    pdfWorker?.destroy();
    workerPort?.terminate();
  }

  let rejectStopped!: (reason: Error) => void;

  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStopped = reject;
  });

  function stop(reason: Error) {
    if (stopError) {
      return;
    }

    stopError = reason;
    rejectStopped(reason);
    cleanup();
  }

  function ensureActive() {
    if (stopError) {
      throw stopError;
    }

    signal.throwIfAborted();
  }

  function onAbort() {
    stop(new DOMException("Resume reading cancelled.", "AbortError"));
  }

  signal.addEventListener("abort", onAbort, { once: true });

  const timeout = setTimeout(() => {
    stop(
      new ResumeFileError(
        "Reading this file took too long. Try a smaller PDF or paste the text.",
      ),
    );
  }, READ_TIMEOUT_MS);

  function checkText(text: string): string {
    const normalized = text
      .replace(/\r\n?/g, "\n")
      .replace(/\u0000/g, "")
      .trim();

    if (!normalized) {
      throw new ResumeFileError(
        isPdf
          ? "No selectable text was found. Scanned PDFs need OCR; paste the resume text instead."
          : "This text file is empty.",
      );
    }

    if (normalized.length > MAX_TEXT_CHARACTERS) {
      throw new ResumeFileError(
        "This resume exceeds 16,000 characters. Paste a shorter relevant section instead.",
      );
    }

    if (isPdf && normalized.length < 40) {
      throw new ResumeFileError(
        "Too little text could be read from this PDF. Try a text-based PDF or paste the resume text.",
      );
    }

    return normalized;
  }

  async function read(): Promise<string> {
    const buffer = await file.arrayBuffer();
    ensureActive();

    const bytes = new Uint8Array(buffer);
    const header = new TextDecoder().decode(bytes.subarray(0, 5));

    if (isText) {
      if (header === "%PDF-") {
        throw new ResumeFileError(
          "This appears to be a PDF. Use a file with the .pdf extension.",
        );
      }

      return checkText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }

    if (header !== "%PDF-") {
      throw new ResumeFileError("This file does not appear to be a valid PDF.");
    }

    if (typeof Worker === "undefined") {
      throw new ResumeFileError(
        "PDF reading is unavailable in this browser. Paste the resume text instead.",
      );
    }

    // Import only after selecting a PDF, never during server rendering.
    const pdfjs = await import("pdfjs-dist");
    ensureActive();

    // Bundle the worker with the application instead of using a CDN.
    workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );

    workerPort.addEventListener(
      "error",
      () => {
        stop(
          new ResumeFileError(
            "The PDF reader couldn’t start. Try refreshing or paste the text.",
          ),
        );
      },
      { once: true },
    );

    pdfWorker = pdfjs.PDFWorker.create({ port: workerPort });

    loadingTask = pdfjs.getDocument({
      data: bytes,
      worker: pdfWorker,

      enableXfa: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      useWasm: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      maxImageSize: 0,
      stopAtErrors: true,
      verbosity: 0,
    });

    loadingTask.onPassword = () => {
      stop(
        new ResumeFileError(
          "Password-protected PDFs are not supported. Use an unlocked copy or paste the text.",
        ),
      );
    };

    const document = await loadingTask.promise;
    ensureActive();

    if (document.numPages > MAX_PDF_PAGES) {
      throw new ResumeFileError("Use a resume PDF with no more than 10 pages.");
    }

    const parts: string[] = [];
    let length = 0;

    function append(text: string) {
      length += text.length;

      if (length > MAX_TEXT_CHARACTERS) {
        throw new ResumeFileError(
          "This resume exceeds 16,000 characters. Paste a shorter relevant section instead.",
        );
      }

      parts.push(text);
    }

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      ensureActive();

      const page = await document.getPage(pageNumber);
      ensureActive();

      // Read text incrementally rather than building one large page string.
      const reader = page.streamTextContent().getReader();

      try {
        while (true) {
          const chunk = await reader.read();
          ensureActive();

          if (chunk.done) {
            break;
          }

          for (const item of chunk.value.items) {
            if ("str" in item) {
              append(item.str);
              append(item.hasEOL ? "\n" : " ");
            }
          }
        }
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
        page.cleanup();
      }

      append("\n");
    }

    ensureActive();

    return checkText(parts.join(""));
  }

  try {
    const result = await Promise.race([read(), stopped]);
    ensureActive();

    return result;
  } catch (failure) {
    if (stopError) {
      throw stopError;
    }

    if (signal.aborted) {
      throw new DOMException("Resume reading cancelled.", "AbortError");
    }

    if (failure instanceof ResumeFileError) {
      throw failure;
    }

    // Don't expose parser errors or document contents.
    throw new ResumeFileError(
      "Couldn’t read this file. Try another file or paste the resume text.",
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
    cleanup();
  }
}

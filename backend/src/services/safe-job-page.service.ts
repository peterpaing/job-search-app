import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

export type JobPage = {
  status: number;
  html: string;
};

type HttpPage = JobPage & {
  location?: string;
};

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

const blocked = new BlockList();
const globalIPv6 = new BlockList();

const blockedIPv4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

for (const [address, prefix] of blockedIPv4) {
  blocked.addSubnet(address, prefix, "ipv4");
}

globalIPv6.addSubnet("2000::", 3, "ipv6");

blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return !blocked.check(address, "ipv4");
  }

  if (family === 6) {
    return globalIPv6.check(address, "ipv6") && !blocked.check(address, "ipv6");
  }

  return false;
}

function validateUrl(url: URL): void {
  const hostname = url.hostname.toLowerCase();

  if (
    url.protocol !== "https:" ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== "" ||
    !hostname.includes(".") ||
    hostname.endsWith(".") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.startsWith("[") ||
    isIP(hostname) !== 0
  ) {
    throw new Error("Unsafe listing URL");
  }
}

async function resolvePublicAddress(
  hostname: string,
  signal: AbortSignal,
): Promise<LookupAddress> {
  signal.throwIfAborted();

  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error("Listing lookup timed out"));
    };

    signal.addEventListener("abort", onAbort, {
      once: true,
    });

    lookup(hostname, {
      all: true,
      verbatim: true,
    }).then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });

  signal.throwIfAborted();

  if (addresses.length === 0) {
    throw new Error("Listing host has no public address");
  }

  if (addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("Listing host resolves to a restricted address");
  }

  return addresses[0]!;
}

async function readOnce(url: URL, signal: AbortSignal): Promise<HttpPage> {
  validateUrl(url);

  const address = await resolvePublicAddress(url.hostname, signal);

  // Always connect to the address already checked above.
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [address]);
    } else {
      callback(null, address.address, address.family);
    }
  };

  return new Promise<HttpPage>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        family: address.family,
        lookup: pinnedLookup,
        servername: url.hostname,
        signal,
        headers: {
          "User-Agent": "StackWingJobAvailability/1.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;

        response.on("error", reject);

        response.on("aborted", () => {
          reject(new Error("Listing response interrupted"));
        });

        if (status !== 200) {
          resolve({
            status,
            html: "",
            location: response.headers.location,
          });

          response.destroy();
          return;
        }

        const encoding = response.headers["content-encoding"];

        if (encoding && encoding !== "identity") {
          reject(new Error("Unsupported listing compression"));

          response.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        let bytes = 0;

        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;

          if (bytes > MAX_BYTES) {
            reject(new Error("Listing response too large"));

            response.destroy();
            return;
          }

          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve({
            status,
            html: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

export async function readJobPage(rawUrl: string): Promise<JobPage> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = new URL(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const page = await readOnce(url, signal);

    if ([301, 302, 303, 307, 308].includes(page.status)) {
      if (!page.location || redirects === MAX_REDIRECTS) {
        throw new Error("Listing redirect limit reached");
      }

      // The next request validates the redirected hostname
      // and pins its checked DNS address independently.
      url = new URL(page.location, url);
      continue;
    }

    return {
      status: page.status,
      html: page.html,
    };
  }

  throw new Error("Listing redirect limit reached");
}

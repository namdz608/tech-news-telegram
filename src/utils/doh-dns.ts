import { lookup as nodeLookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import { Agent } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import axios from "axios";

const systemLookup = nodeLookup as LookupFunction;
const DOH_TIMEOUT_MS = 5000;
const DOH_MAX_BODY_BYTES = 64 * 1024;

interface GoogleDohAnswer {
  type?: number;
  data?: string;
}

interface GoogleDohResponse {
  Status?: number;
  Answer?: GoogleDohAnswer[];
}

export type DohResolver = (hostname: string) => Promise<LookupAddress[]>;

export function createDohFallbackLookup(
  allowedHostname: string,
  baseLookup: LookupFunction = systemLookup,
  resolver: DohResolver = resolveWithGoogleDoh,
): LookupFunction {
  const normalizedAllowedHostname = normalizeHostname(allowedHostname);

  return (hostname, options, callback) => {
    baseLookup(hostname, options, (error, address, family) => {
      if (!error) {
        callback(null, address, family);
        return;
      }

      if (
        error.code !== "ENOTFOUND" ||
        normalizeHostname(hostname) !== normalizedAllowedHostname
      ) {
        callback(error, address, family);
        return;
      }

      void resolver(normalizedAllowedHostname)
        .then((addresses) => addresses.filter(isPublicLookupAddress))
        .then((addresses) => completeLookup(addresses, options, callback))
        .catch((fallbackError: unknown) => {
          callback(normalizeLookupError(fallbackError), address, family);
        });
    });
  };
}

export function createDohFallbackHttpsAgent(hostname: string): Agent {
  return new Agent({ lookup: createDohFallbackLookup(hostname) });
}

async function resolveWithGoogleDoh(
  hostname: string,
): Promise<LookupAddress[]> {
  const responses = await Promise.allSettled([
    queryGoogleDoh(hostname, "A"),
    queryGoogleDoh(hostname, "AAAA"),
  ]);
  const addresses = responses.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (addresses.length === 0) {
    const rejected = responses.find((result) => result.status === "rejected");
    throw rejected?.reason ?? createLookupError("ENOTFOUND");
  }

  return addresses;
}

async function queryGoogleDoh(
  hostname: string,
  type: "A" | "AAAA",
): Promise<LookupAddress[]> {
  const response = await axios.get<GoogleDohResponse>(
    "https://dns.google/resolve",
    {
      params: { name: hostname, type },
      timeout: DOH_TIMEOUT_MS,
      responseType: "json",
      maxRedirects: 0,
      maxContentLength: DOH_MAX_BODY_BYTES,
      maxBodyLength: DOH_MAX_BODY_BYTES,
      headers: { Accept: "application/dns-json" },
    },
  );

  if (response.data.Status !== 0) {
    throw createLookupError("ENOTFOUND");
  }

  const expectedFamily = type === "A" ? 4 : 6;
  const expectedRecordType = type === "A" ? 1 : 28;
  return (response.data.Answer ?? []).flatMap((answer) => {
    const address = answer.data?.trim();
    return answer.type === expectedRecordType &&
      address &&
      isIP(address) === expectedFamily
      ? [{ address, family: expectedFamily }]
      : [];
  });
}

function completeLookup(
  addresses: LookupAddress[],
  options: Parameters<LookupFunction>[1],
  callback: Parameters<LookupFunction>[2],
): void {
  const requestedFamily =
    typeof options === "number" ? options : options.family;
  const eligible =
    requestedFamily === 4 || requestedFamily === 6
      ? addresses.filter((address) => address.family === requestedFamily)
      : addresses;

  if (eligible.length === 0) {
    callback(createLookupError("ENOTFOUND"), "", 0);
    return;
  }

  if (typeof options === "object" && options.all === true) {
    callback(null, eligible, undefined);
    return;
  }

  callback(null, eligible[0]!.address, eligible[0]!.family);
}

function normalizeLookupError(error: unknown): NodeJS.ErrnoException {
  return error instanceof Error
    ? Object.assign(error, {
        code: (error as NodeJS.ErrnoException).code ?? "ENOTFOUND",
      })
    : createLookupError("ENOTFOUND");
}

function createLookupError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function isPublicLookupAddress({ address, family }: LookupAddress): boolean {
  if (family === 4) {
    const octets = address.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((octet) => !Number.isInteger(octet))
    ) {
      return false;
    }
    const [first, second] = octets;
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second! >= 64 && second! <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second! >= 16 && second! <= 31) ||
      (first === 192 && second === 168) ||
      first! >= 224
    );
  }

  if (family !== 6 || isIP(address) !== 6) {
    return false;
  }

  const normalized = address.toLowerCase();
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createDohFallbackLookup } from "../../src/utils/doh-dns";

interface LookupResult {
  address: string | LookupAddress[];
  family?: number;
}

describe("createDohFallbackLookup", () => {
  it("uses DoH for the opted-in hostname only after system DNS returns ENOTFOUND", async () => {
    const systemLookup: LookupFunction = (_hostname, _options, callback) => {
      callback(createDnsError("ENOTFOUND"), "", 0);
    };
    const resolver = vi.fn().mockResolvedValue([
      { address: "104.26.4.185", family: 4 },
      { address: "2606:4700:20::681a:4b9", family: 6 },
    ] satisfies LookupAddress[]);
    const lookupFunction = createDohFallbackLookup(
      "www.thoibao.de",
      systemLookup,
      resolver,
    );

    await expect(lookup(lookupFunction, "www.thoibao.de")).resolves.toEqual({
      address: "104.26.4.185",
      family: 4,
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith("www.thoibao.de");
  });

  it("preserves successful system DNS results without calling DoH", async () => {
    const systemLookup: LookupFunction = (_hostname, _options, callback) => {
      callback(null, "203.0.113.10", 4);
    };
    const resolver = vi.fn();

    await expect(
      lookup(
        createDohFallbackLookup("www.thoibao.de", systemLookup, resolver),
        "www.thoibao.de",
      ),
    ).resolves.toEqual({ address: "203.0.113.10", family: 4 });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("does not use DoH for another hostname or for a DNS error other than ENOTFOUND", async () => {
    const systemLookup: LookupFunction = (_hostname, _options, callback) => {
      callback(createDnsError("ENOTFOUND"), "", 0);
    };
    const resolver = vi.fn();
    const lookupFunction = createDohFallbackLookup(
      "www.thoibao.de",
      systemLookup,
      resolver,
    );

    await expect(lookup(lookupFunction, "example.com")).rejects.toMatchObject({
      code: "ENOTFOUND",
    });

    const temporaryFailureLookup: LookupFunction = (
      _hostname,
      _options,
      callback,
    ) => {
      callback(createDnsError("EAI_AGAIN"), "", 0);
    };
    await expect(
      lookup(
        createDohFallbackLookup(
          "www.thoibao.de",
          temporaryFailureLookup,
          resolver,
        ),
        "www.thoibao.de",
      ),
    ).rejects.toMatchObject({ code: "EAI_AGAIN" });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("preserves all-address lookup semantics and filters non-public DoH answers", async () => {
    const systemLookup: LookupFunction = (_hostname, _options, callback) => {
      callback(createDnsError("ENOTFOUND"), [], undefined);
    };
    const resolver = vi.fn().mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
      { address: "104.26.4.185", family: 4 },
      { address: "::1", family: 6 },
      { address: "2606:4700:20::681a:4b9", family: 6 },
    ] satisfies LookupAddress[]);

    await expect(
      lookup(
        createDohFallbackLookup("www.thoibao.de", systemLookup, resolver),
        "www.thoibao.de",
        { all: true },
      ),
    ).resolves.toEqual({
      address: [
        { address: "104.26.4.185", family: 4 },
        { address: "2606:4700:20::681a:4b9", family: 6 },
      ],
      family: undefined,
    });
  });
});

function lookup(
  lookupFunction: LookupFunction,
  hostname: string,
  options: LookupOptions = {},
): Promise<LookupResult> {
  return new Promise((resolve, reject) => {
    lookupFunction(hostname, options, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ address, family });
    });
  });
}

function createDnsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

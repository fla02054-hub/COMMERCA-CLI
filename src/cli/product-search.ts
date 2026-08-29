export type ProductSearchMode =
  | { mode: "query"; query: string }
  | { mode: "provider"; provider: string; query: string }
  | { mode: "url"; url: string };

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Parse product search arguments without assuming the first token is a provider.
 * Supported forms:
 *   product search <query>
 *   product search <provider> <query>
 *   product search --provider <provider> <query>
 *   product search --url <url>
 *   product search <url>
 */
export function parseProductSearchArgs(
  args: string[],
  knownProviders: string[],
): ProductSearchMode {
  const input = args.join(" ").trim();
  if (!input) {
    throw new Error(
      "usage: product search <query> | product search <provider> <query> | product search <url>",
    );
  }

  if (args[0] === "--url" || args[0] === "-u") {
    const url = args.slice(1).join(" ").trim();
    if (!url || !isHttpUrl(url)) throw new Error("usage: product search --url <url>");
    return { mode: "url", url };
  }

  if (args[0] === "--provider" || args[0] === "-p") {
    const provider = args[1]?.trim();
    const query = args.slice(2).join(" ").trim();
    if (!provider || !knownProviders.includes(provider) || !query) {
      throw new Error("usage: product search --provider <provider> <query>");
    }
    return { mode: "provider", provider, query };
  }

  if (isHttpUrl(input)) return { mode: "url", url: input };

  const maybeProvider = args[0];
  if (knownProviders.includes(maybeProvider)) {
    const query = args.slice(1).join(" ").trim();
    if (!query) throw new Error(`usage: product search ${maybeProvider} <query>`);
    return { mode: "provider", provider: maybeProvider, query };
  }

  return { mode: "query", query: input };
}

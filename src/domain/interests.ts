/**
 * Interests offered as one-click chips when registering. Learners can also
 * type their own.
 */
export const INTEREST_CATALOG = [
  "Backend",
  "Frontend",
  "System design",
  "Algorithms",
  "Data structures",
  "Databases",
  "Distributed systems",
  "Cloud & DevOps",
  "Kubernetes",
  "Security",
  "Machine learning",
  "Data engineering",
  "Mobile",
  "JavaScript",
  "TypeScript",
  "Python",
  "Go",
  "Java",
  "Rust",
  "Behavioural interviews",
] as const;
export type CatalogInterest = (typeof INTEREST_CATALOG)[number];

/** Seed topics for each catalog interest, in the order they're suggested. */
export const INTEREST_TOPICS: Record<CatalogInterest, readonly string[]> = {
  Backend: ["REST API design", "Caching strategies", "Message queues"],
  Frontend: ["Browser rendering pipeline", "React performance", "Web accessibility"],
  "System design": [
    "System design: rate limiters",
    "System design: URL shortener",
    "Load balancing",
  ],
  Algorithms: ["Dynamic programming", "Graph algorithms", "Sorting and searching"],
  "Data structures": ["Hash tables", "Trees and heaps", "Tries"],
  Databases: ["PostgreSQL indexing", "Transactions and isolation levels", "Database sharding"],
  "Distributed systems": ["Consensus with Raft", "Consistency models", "Event sourcing"],
  "Cloud & DevOps": ["CI/CD pipelines", "Infrastructure as code", "Observability"],
  Kubernetes: ["Kubernetes networking", "Kubernetes scheduling", "Helm"],
  Security: ["OWASP Top 10", "OAuth 2.0 and OpenID Connect", "TLS"],
  "Machine learning": ["ML fundamentals", "Model evaluation metrics", "Feature engineering"],
  "Data engineering": [
    "Batch vs stream processing",
    "Apache Kafka",
    "Data modelling for analytics",
  ],
  Mobile: ["Mobile app architecture", "Offline sync", "Mobile performance"],
  JavaScript: [
    "JavaScript event loop",
    "JavaScript closures and scope",
    "Promises and async/await",
  ],
  TypeScript: ["TypeScript generics", "TypeScript type narrowing", "TypeScript utility types"],
  Python: ["Python concurrency", "Python generators and iterators", "Python data model"],
  Go: ["Go concurrency", "Go interfaces", "Go memory model"],
  Java: ["Java concurrency", "JVM garbage collection", "Java collections"],
  Rust: ["Rust ownership and borrowing", "Rust traits", "Async Rust"],
  "Behavioural interviews": ["STAR method stories", "Leadership principles", "Conflict resolution"],
};

export interface CatalogSuggestion {
  name: string;
  reason: string;
}

/** Same normalisation as topic name keys, so suggestions match existing topics. */
export function suggestionNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const CATALOG_BY_KEY = new Map(
  INTEREST_CATALOG.map((interest) => [suggestionNameKey(interest), interest] as const),
);

/**
 * Topics suggested straight from the catalog, with no AI call. Interests take
 * turns so each gets a topic before any gets a second. A free-text interest
 * that isn't in the catalog is suggested as a topic itself. Suggestions whose
 * key is in `excludedNameKeys` are skipped.
 */
export function suggestFromCatalog(
  interests: readonly string[],
  excludedNameKeys: ReadonlySet<string>,
  limit: number,
): CatalogSuggestion[] {
  const queues = interests.map((interest) => {
    const label = interest.trim();
    const catalogInterest = CATALOG_BY_KEY.get(suggestionNameKey(label));
    const names = catalogInterest ? INTEREST_TOPICS[catalogInterest] : [label];
    return names.map((name) => ({ name, reason: `Matches your interest in ${label}.` }));
  });
  const longest = Math.max(0, ...queues.map((queue) => queue.length));

  const seen = new Set(excludedNameKeys);
  const suggestions: CatalogSuggestion[] = [];
  for (let round = 0; round < longest; round++) {
    for (const queue of queues) {
      const suggestion = queue[round];
      if (!suggestion || seen.has(suggestionNameKey(suggestion.name))) continue;
      if (suggestions.length === limit) return suggestions;
      seen.add(suggestionNameKey(suggestion.name));
      suggestions.push(suggestion);
    }
  }
  return suggestions;
}

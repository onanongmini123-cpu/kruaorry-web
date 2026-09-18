export const RESOURCE_PAGE_SIZE = 100;

type Page<T> = { data: T[] | null; error: unknown };

/** Read every page before applying the catalogue's client-visible filters. */
export async function collectResourcePages<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
): Promise<T[] | null> {
  const rows: T[] = [];

  while (true) {
    const page = await fetchPage(rows.length, rows.length + RESOURCE_PAGE_SIZE - 1);
    if (page.error || !page.data) return null;
    rows.push(...page.data);
    if (page.data.length < RESOURCE_PAGE_SIZE) return rows;
  }
}

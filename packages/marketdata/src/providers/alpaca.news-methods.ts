import type { AlpacaNewsArticle, AlpacaRequestFn } from "./alpaca.schemas";

export async function getNews(
	request: AlpacaRequestFn,
	symbols: string[],
	limit = 10,
	start?: string,
	end?: string,
): Promise<AlpacaNewsArticle[]> {
	const articles: AlpacaNewsArticle[] = [];
	try {
		const params: Record<string, string | number | boolean | undefined> = { limit };
		if (symbols.length > 0) {
			params.symbols = symbols.join(",");
		}
		if (start) {
			params.start = start;
		}
		if (end) {
			params.end = end;
		}

		const response = await request<{ news: unknown[] }>("/v1beta1/news", params);
		if (!Array.isArray(response?.news)) {
			return articles;
		}
		for (const article of response.news) {
			const a = article as Record<string, unknown>;
			articles.push({
				id: (a.id as number) ?? 0,
				headline: (a.headline as string) ?? "",
				summary: a.summary as string | undefined,
				author: a.author as string | undefined,
				created_at: (a.created_at as string) ?? new Date().toISOString(),
				updated_at: a.updated_at as string | undefined,
				url: a.url as string | undefined,
				content: a.content as string | undefined,
				symbols: (a.symbols as string[]) ?? [],
				source: (a.source as string) ?? "unknown",
			});
		}
	} catch {
		return articles;
	}
	return articles;
}

"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode, useState } from "react";
import { getQueryClient } from "../api/query-client";

export interface QueryProviderProps {
	children: ReactNode;
	showDevtools?: boolean;
}

export function QueryProvider({ children, showDevtools = false }: QueryProviderProps) {
	// useState ensures stable client across re-renders while allowing SSR to create fresh instances
	const [queryClient] = useState(() => getQueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{showDevtools && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />}
		</QueryClientProvider>
	);
}

export default QueryProvider;

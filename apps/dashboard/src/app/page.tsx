/**
 * Root Page - Redirects to /portfolio
 */

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/portfolio");
}

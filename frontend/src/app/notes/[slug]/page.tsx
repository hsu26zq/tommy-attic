import Article from "@/components/Article";
import { getPublic } from "@/lib/publicData";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const note = await getPublic((await params).slug);
  return { title: note?.title ?? "Not found" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Article slug={(await params).slug} />;
}

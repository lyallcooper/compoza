import type { Metadata } from "next";
import { detailTitleTemplate } from "../../metadata";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent((await params).id);
  return {
    title: { default: name, template: detailTitleTemplate(name) },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

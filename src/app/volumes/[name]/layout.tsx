import type { Metadata } from "next";
import { detailTitleTemplate } from "../../metadata";

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent((await params).name);
  return {
    title: { default: name, template: detailTitleTemplate(name) },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

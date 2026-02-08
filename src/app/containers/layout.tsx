import type { Metadata } from "next";
import { titleTemplate } from "../metadata";

export const metadata: Metadata = {
  title: { default: "Containers", template: titleTemplate },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

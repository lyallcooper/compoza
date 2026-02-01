import Link from "next/link";
import { Box } from "@/components/ui";

export default function NotFound() {
  return (
    <div>
      <Box title="404 - Not Found">
        <div className="space-y-4">
          <p className="text-muted">The page you're looking for doesn't exist.</p>
          <Link href="/" className="text-accent hover:underline">
            Go back home
          </Link>
        </div>
      </Box>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist (or isn’t wired yet).
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}

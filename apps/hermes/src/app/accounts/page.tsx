import { AccountsClient } from "@/app/accounts/accounts-client";
import { connections } from "@/lib/mock-data";

export default function AccountsPage() {
  return <AccountsClient connections={connections} />;
}

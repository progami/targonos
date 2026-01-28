import { MessagingClient } from "@/app/messaging/messaging-client";
import { connections } from "@/lib/mock-data";

export default function MessagingPage() {
  return <MessagingClient connections={connections} />;
}

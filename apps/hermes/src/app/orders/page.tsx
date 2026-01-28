import { OrdersClient } from "@/app/orders/orders-client";
import { connections } from "@/lib/mock-data";

export default function OrdersPage() {
  return <OrdersClient connections={connections} />;
}

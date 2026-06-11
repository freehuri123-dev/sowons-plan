import { Suspense } from "react";
import ClientApp from "./[[...slug]]/client-app";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClientApp />
    </Suspense>
  );
}
